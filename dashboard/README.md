# SENAQ Operations Console — Dashboard

Read-only ops dashboard that mirrors live Supabase state from the WhatsApp
agent. Static files only — no backend of its own. Authenticated staff sign in
with an email magic-link; their session is scoped to read-only RLS policies.

```
 ┌──────────────────┐  postgres_changes  ┌──────────────────┐
 │  Supabase        │ ─────────────────▶ │  app.js          │
 │  (6 tables, RLS) │     (realtime)     │  → render(...)   │
 └──────────────────┘                    └──────────────────┘
        ▲                                          │
        │ service-role (bypasses RLS)              │ authenticated (SELECT only)
        │                                          ▼
  ┌──────────┐                            ┌──────────────────┐
  │ WhatsApp │ ───── webhook  ──────────▶ │  index.html      │
  │ agent    │                            │  + sign-in gate  │
  └──────────┘                            └──────────────────┘
```

## Files

```
dashboard/
  index.html          markup + styles + sign-in gate
  app.js              data layer (auth + fetch + realtime + render)
  config.example.js   template — copy to config.js for local dev
  config.js           local Supabase URL + anon key (gitignored)
  build-config.js     generates config.js from env vars at deploy time
  vercel.json         Vercel static hosting config
  README.md           this file

supabase/migrations/
  0003_dashboard_realtime.sql   RLS on + realtime publication
  0004_dashboard_auth.sql       SELECT policies → authenticated only
```

---

## Local development

1. **Run both migrations** in the Supabase SQL editor:
   - `supabase/migrations/0003_dashboard_realtime.sql`
   - `supabase/migrations/0004_dashboard_auth.sql`

2. **Create `dashboard/config.js`** with your project values
   (Supabase → Project Settings → API):

   ```powershell
   copy dashboard\config.example.js dashboard\config.js
   ```

   Then edit it — paste your `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the **anon** key, not service-role).

3. **Configure Supabase Auth** (one-time, in Supabase dashboard):
   - Authentication → Providers → Email — **enable**
   - Authentication → Providers → Email — **disable** "Enable Signups"
   - Authentication → Users → "Add user" — pre-create each staff email
   - Authentication → URL Configuration → add `http://localhost:5173` to **Redirect URLs**

4. **Start the dev server**:

   ```powershell
   npm run dashboard
   ```

   Open http://localhost:5173/ — you'll see the sign-in screen.
   Enter a pre-created staff email; Supabase emails you a one-time link;
   click it and the dashboard loads.

---

## Production deploy (Vercel)

The dashboard ships as its **own** Vercel project — independent from the
webhook deployment. This keeps the webhook routing clean and gives the
client a separate domain (e.g. `senaq-ops.vercel.app`).

### One-time setup

1. **Create a new Vercel project** pointed at this repo, with
   **Root Directory** set to `dashboard/`.

2. **Add Environment Variables** (Production, Preview, Development):
   - `SUPABASE_URL` — same as your backend's value
   - `SUPABASE_ANON_KEY` — anon / public key (never service-role)

3. **Add your production URL to Supabase Auth Redirect URLs**:
   Supabase → Authentication → URL Configuration → add
   `https://<your-vercel-domain>` (and any preview-deployment patterns).

4. **Deploy.** Vercel runs `node build-config.js` which writes `config.js`
   from the env vars, then serves the directory as a static site.

### Deploy from CLI

```powershell
cd dashboard
vercel --prod
```

(First run: Vercel CLI will ask you to link the project.)

### Updating

Any push to the branch Vercel is watching triggers a new deploy automatically.

---

## What's wired

| Section                       | Source table(s)                                    | Realtime triggers re-render               |
|-------------------------------|----------------------------------------------------|-------------------------------------------|
| Active Conversations (stat)   | `customers` (where `wa_stage NOT IN (idle, done)`) | `customers`                               |
| Jobs Today (stat)             | `jobs` (today's `slot_iso`)                        | `jobs`                                    |
| AMC Expiring · 30d (stat)     | `amc_contracts` (renewal ≤ +30d)                   | `amc_contracts`                           |
| Overdue Invoices (stat)       | `invoices` (`status=pending` AND `due_date<today`) | `invoices`                                |
| Live conversations feed       | `customers`                                        | `customers`                               |
| Today's jobs timeline         | `jobs` + `customers` join                          | `jobs`                                    |
| Alerts panel                  | open `complaints` + overdue `invoices` + AMC ≤ 7d  | `complaints`, `invoices`, `amc_contracts` |
| Jobs table                    | `jobs` + `customers` join                          | `jobs`                                    |
| AMC contracts table           | `amc_contracts` + `customers` join                 | `amc_contracts`                           |
| Invoices table                | `invoices` + `customers` + `jobs` join             | `invoices`                                |
| Complaints table              | `complaints` + `customers` join                    | `complaints`                              |
| Reminder queue table          | `reminders` + `customers` join                     | `reminders`                               |

- `/` (keyboard) focuses search in the active tab.
- `Esc` clears the search.
- Click the avatar (top-right) to sign out.
- "Export CSV" downloads the visible (post-filter) rows of the active table.

---

## Security model

| Concern                       | Mitigation                                                                 |
|-------------------------------|----------------------------------------------------------------------------|
| Anyone with the URL can read  | Anon role has no SELECT. RLS requires `authenticated`. Sign-in gate first. |
| Open self-signup              | Email "Enable Signups" must be OFF in Supabase. Staff are pre-created.     |
| Service-role key in browser   | `build-config.js` rejects any key whose payload says `service_role`.       |
| Embedded in another site      | `X-Frame-Options: DENY` header from `vercel.json`.                         |
| MIME sniffing / XSS surface   | `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin`.       |
| Sensitive fingerprint APIs    | `Permissions-Policy` denies geo / mic / camera.                            |

The dashboard is **read-only** by design. No write endpoint is exposed
through RLS — even an authenticated session can't insert, update, or delete.

If you need to widen access later (e.g. ops staff marking complaints
resolved from the dashboard), add a separate policy like:

```sql
CREATE POLICY ops_resolve_complaints ON complaints
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (status IN ('open', 'in_progress', 'resolved'));
```
