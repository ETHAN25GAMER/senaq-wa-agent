import { supabase } from "../supabase/client.js";
import { config } from "../config.js";
import { sendText } from "../whatsapp/client.js";
import { log } from "../utils/logger.js";
import { t } from "../i18n/strings.js";
import type { ToolResult } from "../types.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SendReviewLinkInput {
  customer_id: string;
  job_id: string;
}

const FALLBACK_REVIEW_URL = "https://g.page/r/senaq-pest-control/review";

export async function handler(
  input: SendReviewLinkInput,
): Promise<ToolResult> {
  if (!UUID_RE.test(input.customer_id)) {
    log.warn("send_review_link_bad_customer_id", {
      customer_id: input.customer_id,
    });
    return { ok: false, error: "invalid customer_id" };
  }
  try {
    const { data: customer, error } = await supabase
      .from("customers")
      .select("phone")
      .eq("id", input.customer_id)
      .maybeSingle();
    if (error) throw error;
    if (!customer?.phone) {
      return { ok: false, error: "customer phone not found" };
    }

    const url = config.GOOGLE_REVIEW_URL ?? FALLBACK_REVIEW_URL;

    await sendText(customer.phone, t("review_link_body", { url }));

    log.info("send_review_link_ok", {
      customer_id: input.customer_id,
      job_id: input.job_id,
    });
    return { ok: true, data: { url } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("send_review_link_failed", {
      msg,
      customer_id: input.customer_id,
    });
    return { ok: false, error: msg };
  }
}
