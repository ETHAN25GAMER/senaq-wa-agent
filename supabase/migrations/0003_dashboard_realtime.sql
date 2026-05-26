-- ============================================================================
-- 0003_dashboard_realtime.sql
--
-- Wires the read-only ops dashboard (dashboard/index.html) to the database:
--   • Enables RLS on all six tables.
--   • Adds a permissive SELECT policy for the anon role.
--   • Adds all six tables to the supabase_realtime publication so the
--     dashboard receives INSERT/UPDATE/DELETE notifications.
--
-- The backend agent uses the service-role key, which BYPASSES RLS — so
-- WhatsApp flow writes are unaffected.
--
-- ⚠ The anon-role SELECT policy is permissive (anyone with the URL +
-- anon key can read all data). Acceptable for an internal/local-only
-- dashboard; add Supabase Auth + a stricter policy (e.g. only authenticated
-- staff) before exposing publicly.
--
-- Safe to re-run.
-- ============================================================================

ALTER TABLE customers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE amc_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints    ENABLE ROW LEVEL SECURITY;

-- ── read-only policies for the dashboard (anon role) ──────────────────────
DROP POLICY IF EXISTS dashboard_read ON customers;
CREATE POLICY dashboard_read ON customers     FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS dashboard_read ON jobs;
CREATE POLICY dashboard_read ON jobs          FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS dashboard_read ON amc_contracts;
CREATE POLICY dashboard_read ON amc_contracts FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS dashboard_read ON invoices;
CREATE POLICY dashboard_read ON invoices      FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS dashboard_read ON reminders;
CREATE POLICY dashboard_read ON reminders     FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS dashboard_read ON complaints;
CREATE POLICY dashboard_read ON complaints    FOR SELECT TO anon USING (true);

-- ── attach each table to the realtime publication if not already ──────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers', 'jobs', 'amc_contracts', 'invoices', 'reminders', 'complaints'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname    = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename  = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;
