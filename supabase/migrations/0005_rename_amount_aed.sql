-- ============================================================================
-- 0005_rename_amount_aed.sql
--
-- Removes Dubai/UAE-specific naming from the schema:
--   • invoices.amount_aed → invoices.amount (currency-agnostic)
--   • Cleans up stale customer rows still parked on the (now removed)
--     choose_language stage, and strips the `language` key from wa_context.
--
-- Safe to re-run.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'invoices'
       AND column_name  = 'amount_aed'
  ) THEN
    ALTER TABLE invoices RENAME COLUMN amount_aed TO amount;
  END IF;
END $$;

-- Reset any customer sitting on the obsolete choose_language stage so they
-- get routed into the new English-only main menu on their next turn.
UPDATE customers
   SET wa_stage   = 'idle',
       wa_context = wa_context - 'language'
 WHERE wa_stage = 'choose_language';

-- Strip the leftover `language` key from every other customer's wa_context.
-- (JSONB minus a key is a no-op if the key isn't present.)
UPDATE customers
   SET wa_context = wa_context - 'language'
 WHERE wa_context ? 'language';
