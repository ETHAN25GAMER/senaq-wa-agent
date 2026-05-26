import { supabase } from "../supabase/client.js";
import { log } from "../utils/logger.js";
import type { ToolResult } from "../types.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EscalateComplaintInput {
  customer_id: string;
  reason: string;
  severity: "low" | "medium" | "high";
}

export async function handler(
  input: EscalateComplaintInput,
): Promise<ToolResult> {
  // The complaints table allows NULL customer_id (ON DELETE SET NULL), so a
  // missing/invalid customer_id is logged but doesn't block the row insert.
  const customer_id = UUID_RE.test(input.customer_id) ? input.customer_id : null;
  if (!customer_id) {
    log.warn("escalate_complaint_no_customer", {
      passed: input.customer_id,
      reason: input.reason,
    });
  }
  try {
    const { data, error } = await supabase
      .from("complaints")
      .insert({
        customer_id,
        reason: input.reason,
        severity: input.severity,
      })
      .select("id")
      .single();
    if (error) throw error;
    log.info("escalate_complaint_ok", {
      complaint_id: data.id,
      severity: input.severity,
      customer_id,
    });
    return { ok: true, data: { id: data.id } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("escalate_complaint_failed", { msg });
    return { ok: false, error: msg };
  }
}
