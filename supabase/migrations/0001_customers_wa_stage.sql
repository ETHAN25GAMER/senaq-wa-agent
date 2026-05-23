-- Adds the conversation-state column the WhatsApp agent reads/writes each turn.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS wa_stage TEXT NOT NULL DEFAULT 'idle';

CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers (phone);
