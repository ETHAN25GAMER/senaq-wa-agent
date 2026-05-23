// Hono app definition — no server bootstrap.
//
// Used by:
//   - src/index.ts        (local dev: wraps this with @hono/node-server)
//   - api/[[...path]].ts  (Vercel: exports this as a serverless function)

import { Hono } from "hono";

import { config } from "./config.js";
import { handleTurn } from "./agent.js";
import { dispatch } from "./tools/index.js";
import { sendButtons } from "./whatsapp/client.js";
import { parseInbound } from "./whatsapp/parser.js";
import { verifyHandshake, verifySignature } from "./whatsapp/validator.js";
import {
  findStaleCustomers,
  getCustomer,
  getWaState,
  setWaState,
  upsertCustomer,
} from "./supabase/queries.js";
import { check as rateCheck } from "./utils/rate-limiter.js";
import {
  RateLimitError,
  ValidationError,
  withErrorHandling,
} from "./utils/error-handler.js";
import { log } from "./utils/logger.js";
import { t, type Language } from "./i18n/strings.js";
import type { OutboundButton, WaContext } from "./types.js";

export const app = new Hono();

app.get("/healthz", (c) => c.json({ ok: true }));

app.get(
  "/webhook",
  withErrorHandling((c) => {
    const challenge = verifyHandshake(
      {
        mode: c.req.query("hub.mode"),
        token: c.req.query("hub.verify_token"),
        challenge: c.req.query("hub.challenge"),
      },
      config.WHATSAPP_VERIFY_TOKEN,
    );
    if (challenge === null) return c.text("forbidden", 403);
    return c.text(challenge, 200);
  }),
);

app.post(
  "/webhook",
  withErrorHandling(async (c) => {
    const raw = await c.req.text();
    const sig = c.req.header("x-hub-signature-256");
    if (!verifySignature(raw, sig, config.WHATSAPP_APP_SECRET)) {
      throw new ValidationError("invalid signature");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new ValidationError("invalid json body");
    }

    const parsed = parseInbound(payload);
    if (parsed.kind === "ignore") return c.json({ ok: true });

    const from = parsed.kind === "button" ? parsed.reply.from : parsed.from;

    const limit = rateCheck(from);
    if (!limit.allowed) {
      throw new RateLimitError("too many messages", limit.retryAfterMs);
    }

    const customer =
      (await getCustomer(from)) ??
      (await upsertCustomer({ phone: from, wa_stage: "idle", wa_context: {} }));

    if (parsed.kind === "non_button") {
      // A brand-new customer's first message is always free text — they have
      // nothing to tap yet. Route them through the router from `idle` so they
      // get the language picker instead of the generic fallback menu.
      if (!customer.wa_context?.language) {
        const result = await handleTurn({
          customer,
          waStage: "idle",
          waContext: {},
          buttonReply: null,
        });
        await sendButtons({
          to: from,
          body: result.body,
          buttons: result.buttons,
        });
        await setWaState(from, result.nextStage, {
          ...result.nextContext,
          last_prompt: { body: result.body, buttons: result.buttons },
        });
        return c.json({ ok: true });
      }

      // Existing customer typed free text mid-flow: re-prompt with the
      // fallback button menu in their language. Never parse the text.
      const lang: Language = customer.wa_context.language;
      const body = t(lang, "fallback_prompt");
      const buttons: OutboundButton[] = [
        { id: "menu", title: t(lang, "btn_main_menu") },
        { id: "talk_human", title: t(lang, "btn_talk_human") },
      ];
      await sendButtons({ to: from, body, buttons });
      await setWaState(from, "menu", {
        language: lang,
        last_prompt: { body, buttons },
      });
      return c.json({ ok: true });
    }

    const state = await getWaState(from);

    const result = await handleTurn({
      customer,
      waStage: state.stage,
      waContext: state.context,
      buttonReply: parsed.reply,
    });

    await sendButtons({
      to: from,
      body: result.body,
      buttons: result.buttons,
    });

    // Snapshot the outbound message so the follow-up-nudge skill can replay
    // it verbatim if the customer goes idle here.
    const ctxWithPrompt: WaContext = {
      ...result.nextContext,
      last_prompt: { body: result.body, buttons: result.buttons },
    };
    await setWaState(from, result.nextStage, ctxWithPrompt);

    return c.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// follow-up-nudge cron endpoint.
//
// Driven by Vercel Cron (vercel.json) or an external scheduler. Caller MUST
// send `Authorization: Bearer <CRON_SECRET>` — Vercel Cron injects this
// automatically when CRON_SECRET is set on the project.
// ---------------------------------------------------------------------------

function fupButtons(lang: Language): OutboundButton[] {
  return [
    { id: "fup_continue", title: t(lang, "btn_fup_continue") },
    { id: "fup_restart", title: t(lang, "btn_fup_restart") },
    { id: "fup_no", title: t(lang, "btn_fup_no") },
  ];
}

app.post(
  "/cron/followup",
  withErrorHandling(async (c) => {
    const auth = c.req.header("authorization");
    if (auth !== `Bearer ${config.CRON_SECRET}`) {
      return c.text("forbidden", 403);
    }

    const now = new Date();
    const buckets = await findStaleCustomers({ now });

    log.info("cron_followup_start", {
      firstNudge: buckets.firstNudge.length,
      secondNudge: buckets.secondNudge.length,
      toEscalate: buckets.toEscalate.length,
    });

    let processedFirst = 0;
    let processedSecond = 0;
    let processedEscalate = 0;

    for (const customer of buckets.firstNudge) {
      try {
        const lang: Language = customer.wa_context?.language ?? "en";
        await sendButtons({
          to: customer.phone,
          body: t(lang, "fup_first_body"),
          buttons: fupButtons(lang),
        });
        const nextCtx: WaContext = {
          ...(customer.wa_context ?? {}),
          prev_stage: customer.wa_stage,
          followup1_sent_at: now.toISOString(),
        };
        await setWaState(customer.phone, "followup_pending", nextCtx);
        processedFirst++;
      } catch (err) {
        log.error("cron_followup_first_failed", {
          phone: customer.phone,
          msg: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (const customer of buckets.secondNudge) {
      try {
        const lang: Language = customer.wa_context?.language ?? "en";
        await sendButtons({
          to: customer.phone,
          body: t(lang, "fup_second_body"),
          buttons: fupButtons(lang),
        });
        const nextCtx: WaContext = {
          ...(customer.wa_context ?? {}),
          followup2_sent_at: now.toISOString(),
        };
        await setWaState(customer.phone, "followup_pending", nextCtx);
        processedSecond++;
      } catch (err) {
        log.error("cron_followup_second_failed", {
          phone: customer.phone,
          msg: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (const customer of buckets.toEscalate) {
      try {
        await dispatch("escalate-complaint", {
          customer_id: customer.id,
          reason: "Customer abandoned conversation (no reply after 2 follow-ups)",
          severity: "low",
        });
        await setWaState(customer.phone, "escalated", {
          language: customer.wa_context?.language ?? "en",
        });
        processedEscalate++;
      } catch (err) {
        log.error("cron_followup_escalate_failed", {
          phone: customer.phone,
          msg: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return c.json({
      ok: true,
      processed: {
        firstNudge: processedFirst,
        secondNudge: processedSecond,
        escalated: processedEscalate,
      },
    });
  }),
);

// Vercel Cron uses GET by default; mirror POST handler so it works for both.
app.get("/cron/followup", (c) => {
  const auth = c.req.header("authorization");
  if (auth !== `Bearer ${config.CRON_SECRET}`) return c.text("forbidden", 403);
  return app.fetch(
    new Request(new URL("/cron/followup", "http://internal").toString(), {
      method: "POST",
      headers: { authorization: auth },
    }),
  );
});
