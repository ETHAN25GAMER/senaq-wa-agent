-- Stores intermediate selections the WhatsApp router carries across turns
-- (chosen service, date, slot, current invoice id, etc.).
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS wa_context JSONB NOT NULL DEFAULT '{}'::jsonb;
