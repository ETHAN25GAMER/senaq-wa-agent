-- SENAQ WhatsApp agent — full Supabase schema.
-- Paste this entire file into Supabase SQL Editor and Run.
--
-- Safe to re-run: every CREATE uses IF NOT EXISTS.

-- ============================================================================
-- customers
-- ============================================================================
CREATE TABLE IF NOT EXISTS customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT UNIQUE NOT NULL,
  name        TEXT,
  address     TEXT,
  amc_tier    TEXT CHECK (amc_tier IN ('none','basic','premium')) DEFAULT 'none',
  wa_stage    TEXT NOT NULL DEFAULT 'idle',
  wa_context  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers (phone);

-- ============================================================================
-- jobs  (booked appointments, written by insert-job)
-- ============================================================================
CREATE TABLE IF NOT EXISTS jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_type  TEXT NOT NULL CHECK (service_type IN ('cockroach','bed_bugs','general','amc_visit')),
  slot_iso      TIMESTAMPTZ NOT NULL,
  address       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','completed','cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_customer_idx ON jobs (customer_id);
CREATE INDEX IF NOT EXISTS jobs_slot_idx     ON jobs (slot_iso);

-- ============================================================================
-- amc_contracts  (annual maintenance contracts, written by update-amc)
-- ============================================================================
CREATE TABLE IF NOT EXISTS amc_contracts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  tier         TEXT NOT NULL CHECK (tier IN ('none','basic','premium')),
  renewal_iso  DATE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- invoices  (referenced by generate-payment-link + invoice-reminders skill)
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  job_id       UUID REFERENCES jobs(id) ON DELETE SET NULL,
  amount_aed   NUMERIC(10,2) NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','paid','disputed','cancelled')),
  due_date     DATE NOT NULL,
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_customer_idx ON invoices (customer_id);
CREATE INDEX IF NOT EXISTS invoices_due_idx
  ON invoices (due_date) WHERE status = 'pending';

-- ============================================================================
-- reminders  (queued nudges fired by a worker, written by schedule-reminder)
-- ============================================================================
CREATE TABLE IF NOT EXISTS reminders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('appointment','invoice')),
  fire_at_iso  TIMESTAMPTZ NOT NULL,
  fired_at     TIMESTAMPTZ,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reminders_due_idx
  ON reminders (fire_at_iso) WHERE fired_at IS NULL;

-- ============================================================================
-- complaints  (escalations from escalate-complaint)
-- ============================================================================
CREATE TABLE IF NOT EXISTS complaints (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID REFERENCES customers(id) ON DELETE SET NULL,
  reason       TEXT NOT NULL,
  severity     TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
  status       TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','in_progress','resolved')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS complaints_open_idx
  ON complaints (status) WHERE status != 'resolved';

-- ============================================================================
-- updated_at triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'customers_set_updated_at') THEN
    CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON customers
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'jobs_set_updated_at') THEN
    CREATE TRIGGER jobs_set_updated_at BEFORE UPDATE ON jobs
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'amc_contracts_set_updated_at') THEN
    CREATE TRIGGER amc_contracts_set_updated_at BEFORE UPDATE ON amc_contracts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'invoices_set_updated_at') THEN
    CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON invoices
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
