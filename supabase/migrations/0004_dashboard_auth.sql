-- ============================================================================
-- 0004_dashboard_auth.sql
--
-- Tightens the dashboard read policies from `anon` (anyone with the URL)
-- to `authenticated` (signed-in Supabase users only).
--
-- Run this AFTER 0003_dashboard_realtime.sql.
--
-- ── Companion change in the Supabase dashboard (NOT SQL) ──
-- 1. Authentication → Providers → Email      → enable
-- 2. Authentication → Providers → Email      → DISABLE "Enable Signups"
--    (otherwise anyone with a valid email can self-register)
-- 3. Authentication → Users → Add user       → pre-create staff emails
-- 4. Authentication → URL Configuration      → add your deployed dashboard
--    URL (e.g. https://senaq-ops.vercel.app) to the Redirect URLs allow-list
--
-- Safe to re-run.
-- ============================================================================

DROP POLICY IF EXISTS dashboard_read ON customers;
CREATE POLICY dashboard_read ON customers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS dashboard_read ON jobs;
CREATE POLICY dashboard_read ON jobs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS dashboard_read ON amc_contracts;
CREATE POLICY dashboard_read ON amc_contracts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS dashboard_read ON invoices;
CREATE POLICY dashboard_read ON invoices
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS dashboard_read ON reminders;
CREATE POLICY dashboard_read ON reminders
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS dashboard_read ON complaints;
CREATE POLICY dashboard_read ON complaints
  FOR SELECT TO authenticated USING (true);
