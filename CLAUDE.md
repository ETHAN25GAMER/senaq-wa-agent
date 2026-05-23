# SENAQ WhatsApp Agent — Project Guide

WhatsApp Business agent for **SENAQ Pest Control (Dubai)**. Customer interactions
are **strictly button-based MCQ** — never free text. Bilingual: English + Arabic.

## What this is (and isn't)

- **No LLM.** This was originally scaffolded with Anthropic SDK + prompt caching;
  that was deliberately removed. `src/agent.ts` is a deterministic state machine —
  every `(stage, buttonId, ctx)` triple has exactly one correct transition.
- **No free-text inputs.** If a customer types text instead of tapping a button,
  the webhook replies with a fallback button menu and never tries to parse text.
- **Stateless agent, stateful customer.** The router is pure. All state lives in
  the Supabase `customers` row (`wa_stage` + `wa_context` JSONB).

## Tech stack

- **Runtime:** TypeScript + Node 20 (ES modules, strict mode).
- **Web:** Hono (works both locally via `@hono/node-server` and on Vercel via
  `@hono/node-server/vercel`).
- **DB:** Supabase (Postgres) — service-role key, no RLS reliance.
- **Messaging:** Meta WhatsApp Cloud API (Graph v21.0).
- **Validation:** zod on env vars.

## Directory layout

```
src/
  app.ts                 Hono routes (webhook, /healthz, /cron/followup)
  index.ts               local dev entry only (Vercel uses api/)
  agent.ts               THE routing table — every stage maps to a Transition
  config.ts              zod-validated env loader (reads process.env)
  types.ts               WaStage, WaContext, Customer, AgentTurnResult
  i18n/
    strings.ts           en/ar translation table + t(lang, key, params?)
  skills/                ONE folder per skill, each with a SKILL.md (docs only)
    appointment-chatbot/
    post-service-review/
    appointment-reminders/
    invoice-reminders/
    follow-up-nudge/
  tools/                 7 tool handlers, currently STUBS returning {ok:true, todo:...}
    index.ts             dispatch(name, input) switch
    check-availability.ts, insert-job.ts, update-amc.ts,
    generate-payment-link.ts, escalate-complaint.ts,
    schedule-reminder.ts, send-review-link.ts
  whatsapp/
    client.ts            sendButtons() → POST to Graph API
    validator.ts         HMAC-SHA256 signature check + handshake helper
    parser.ts            inbound payload → ButtonReply | non_button | ignore
  supabase/
    client.ts            singleton supabase-js client (service-role key)
    queries.ts           getCustomer, upsertCustomer, getWaState, setWaState,
                         findStaleCustomers (for follow-up cron)
  utils/
    logger.ts            JSON-line logger (info/warn/error)
    rate-limiter.ts      in-memory sliding window (TODO: Redis for multi-instance)
    error-handler.ts     withErrorHandling wrapper + classified error types

api/
  [[...path]].ts         Vercel catch-all — exports app via @hono/node-server/vercel

scripts/
  test-flow.ts           CLI flow runner — replays scenarios through agent.ts
                         without Supabase/Meta. PRIMARY way to verify changes.
  preview-on-whatsapp.ts Sends a 21-message demo to a real phone via Meta.
  diagnose-whatsapp.ts   One-shot Meta API call with full response logging.

supabase/
  schema.sql             Full schema for ALL tables (customers, jobs, amc_contracts,
                         invoices, reminders, complaints). Run once.
  migrations/            Historical migrations (superseded by schema.sql).

vercel.json              Rewrites all routes through api/, schedules /cron/followup
```

## Common commands

```powershell
npm run dev           # local Hono server on :3000 (tsx watch + --env-file=.env)
npm run typecheck     # strict tsc, must always pass
npm run test:flow     # run all 25 router scenarios in terminal (zero deps)
npm run test:flow booking      # filter by skill or scenario name

# Send a real 21-message demo to a WhatsApp number:
npx tsx --env-file=.env scripts/preview-on-whatsapp.ts +919653411753

# One-shot Meta API diagnostic:
npx tsx --env-file=.env scripts/diagnose-whatsapp.ts +919653411753
```

## Hard rules (do not break)

1. **Buttons only.** Every customer-facing message has 1–3 buttons.
   `sendButtons()` enforces 1–3; Meta also caps button **titles at 20 chars**.
2. **Always localize.** Never hardcode a customer-facing string in `agent.ts`
   or `app.ts`. Use `t(lang, "key", { params? })` from `src/i18n/strings.ts`.
   `Record<Language, Record<StringKey, string>>` makes TypeScript fail loudly
   if any key is missing in either language.
3. **Always set `nextContext`.** Every `Transition` returned from `agent.ts`
   must include `nextContext` (it gets persisted via `setWaState`). When you
   want to clear context, pass `{ language: lang }` to preserve the language.
4. **`stripFollowupFields()` must preserve `language`.** Don't pull it out.
5. **Verify signature against the RAW body.** In `app.ts`, signature check
   happens BEFORE `JSON.parse`. Don't rearrange.

## How state works (read this once)

- Every customer has one row in `customers` keyed by `phone`.
- The row stores `wa_stage` (which screen they're on) + `wa_context` (JSONB
  blob with intermediate selections and bookkeeping).
- Each inbound turn: `getWaState` → run `handleTurn` → `sendButtons` →
  `setWaState`. The router never persists; the webhook persists.
- `wa_context` always carries `last_prompt: { body, buttons }` — the most
  recently-sent outbound. The follow-up-nudge skill replays this when a
  customer hits "Continue" on a re-engagement nudge.

## How a new skill gets added

1. Decide if it's customer-triggered (button from menu) or system-triggered
   (cron / outbound).
2. Add any new stages to `WaStage` in `src/types.ts`.
3. Add any new context fields to `WaContext` in `src/types.ts`.
4. Add new string keys to `StringKey` in `src/i18n/strings.ts`, then add
   translations in BOTH `en` and `ar` blocks (TypeScript will scream until both).
5. Add a `from<NewStage>` handler in `src/agent.ts` and wire it into the
   `route()` switch. Use `t(lang, ...)` for every string.
6. Add scenarios to `scripts/test-flow.ts` — both happy path and edge cases.
7. `npm run typecheck && npm run test:flow` — both must pass.
8. (Optional) Create `src/skills/<name>/SKILL.md` documenting the stage map.

## Tool handlers (the stubbed ones)

The 7 tool handlers in `src/tools/` currently return `{ ok: true, todo: "..." }`.
They're called by `dispatch()` in `tools/index.ts`. To wire one up:

1. Implement the real logic in the corresponding file (e.g. `insert-job.ts`
   inserts into the `jobs` Supabase table).
2. The tool's `input` shape is already typed; trust it.
3. Errors should throw — the caller (in `agent.ts`'s `handleTurn`) logs them.

## Vercel deploy

- `vercel --prod` from project root.
- Env vars: paste all values from `.env` into Vercel dashboard → Settings →
  Environment Variables. `CRON_SECRET` is what protects `/cron/followup`.
- **Hobby tier caveat:** sub-daily crons may require Pro. If `*/15 * * * *`
  in `vercel.json` is rejected, point an external cron service
  (cron-job.org, GitHub Actions) at `https://<app>.vercel.app/cron/followup`
  with `Authorization: Bearer $CRON_SECRET`. Code is identical.

## Things that are deliberately out of scope

- **No Anthropic SDK / LLM.** Removed on purpose. Do not re-add unless the
  user explicitly asks.
- **No third-party rate limiter** (e.g. Upstash). In-memory `Map` is fine for
  single-instance dev; serverless deploys will reset it on cold starts.
- **No template messages.** All outbound uses interactive button messages,
  which means the 24h re-engagement window applies. Adding templates later
  is fine but separate.
- **Tool handlers are stubs.** Real backend integration is a future PR per tool.
- **No tests beyond `scripts/test-flow.ts`.** No vitest/jest yet — the flow
  runner covers the state machine, which is the riskiest surface.

## Gotchas to avoid

- **Don't bypass `t()`** for customer-facing strings. Even "Yes"/"No" goes
  through the table.
- **Don't add a 4th button** — WhatsApp interactive button messages cap at 3.
  Use a list-message (different UI) if you genuinely need more.
- **Don't put real secrets in `.env.example`.** That file gets committed.
  Secrets live in `.env` (gitignored) and Vercel env vars.
- **Don't change the order of webhook handler steps** in `app.ts`
  (validate → parse → rate-limit → load customer → route → send → save).
- **Don't mark `wa_stage` as a Postgres enum.** It's TEXT; new stages get
  added in TypeScript without DB migrations.
