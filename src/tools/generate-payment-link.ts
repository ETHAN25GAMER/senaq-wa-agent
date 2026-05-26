import { supabase } from "../supabase/client.js";
import { config } from "../config.js";
import { sendText } from "../whatsapp/client.js";
import { log } from "../utils/logger.js";
import { t } from "../i18n/strings.js";
import type { ToolResult } from "../types.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GeneratePaymentLinkInput {
  invoice_id: string;
  amount: number;
}

const FALLBACK_BASE = "https://pay.senaq.invalid/invoice";

export async function handler(
  input: GeneratePaymentLinkInput,
): Promise<ToolResult> {
  if (!UUID_RE.test(input.invoice_id)) {
    log.warn("payment_link_bad_invoice_id", { invoice_id: input.invoice_id });
    return { ok: false, error: "invalid invoice_id" };
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "invalid amount" };
  }
  try {
    // Confirm the invoice exists, still owes money, and pull the customer phone.
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("id, status, amount, customer:customers(phone)")
      .eq("id", input.invoice_id)
      .maybeSingle();
    if (error) throw error;
    if (!invoice) return { ok: false, error: "invoice not found" };
    if (invoice.status !== "pending") {
      return { ok: false, error: `invoice is ${invoice.status}, not pending` };
    }

    // Real provider integration goes here (Stripe / etc.).
    // For now: a deterministic URL the deploy can swap in later.
    const base = config.PAYMENT_LINK_BASE ?? FALLBACK_BASE;
    const url = `${base.replace(/\/$/, "")}/${input.invoice_id}?amt=${input.amount}`;

    const phone = (invoice.customer as { phone?: string } | null)?.phone;

    if (phone) {
      try {
        await sendText(phone, t("pay_link_body", { url, amt: String(input.amount) }));
      } catch (sendErr) {
        // Don't fail the whole tool if the WA send fails — the URL still exists.
        log.warn("payment_link_send_failed", {
          phone,
          msg: sendErr instanceof Error ? sendErr.message : String(sendErr),
        });
      }
    } else {
      log.warn("payment_link_no_phone", { invoice_id: input.invoice_id });
    }

    log.info("payment_link_generated", {
      invoice_id: input.invoice_id,
      amount: input.amount,
      url,
    });
    return { ok: true, data: { url } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("payment_link_failed", { msg });
    return { ok: false, error: msg };
  }
}
