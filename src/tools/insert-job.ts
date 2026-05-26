import { supabase } from "../supabase/client.js";
import { log } from "../utils/logger.js";
import type { ToolResult } from "../types.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InsertJobInput {
  customer_id: string;
  service_type: "cockroach" | "bed_bugs" | "general" | "amc_visit";
  slot_iso: string;
  address: string;
}

export async function handler(input: InsertJobInput): Promise<ToolResult> {
  if (!UUID_RE.test(input.customer_id)) {
    log.warn("insert_job_bad_customer_id", { customer_id: input.customer_id });
    return { ok: false, error: "invalid customer_id" };
  }
  try {
    const { data, error } = await supabase
      .from("jobs")
      .insert({
        customer_id: input.customer_id,
        service_type: input.service_type,
        slot_iso: input.slot_iso,
        address: input.address,
      })
      .select("id")
      .single();
    if (error) throw error;
    log.info("insert_job_ok", {
      job_id: data.id,
      customer_id: input.customer_id,
      slot_iso: input.slot_iso,
    });
    return { ok: true, data: { id: data.id } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("insert_job_failed", { msg, customer_id: input.customer_id });
    return { ok: false, error: msg };
  }
}
