import { supabase } from "../supabase/client.js";
import { log } from "../utils/logger.js";
import type { ToolResult } from "../types.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UpdateAmcInput {
  customer_id: string;
  amc_tier: "none" | "basic" | "premium";
  renewal_iso: string;
}

export async function handler(input: UpdateAmcInput): Promise<ToolResult> {
  if (!UUID_RE.test(input.customer_id)) {
    log.warn("update_amc_bad_customer_id", { customer_id: input.customer_id });
    return { ok: false, error: "invalid customer_id" };
  }
  try {
    // renewal_iso column is DATE; accept either a date or full timestamp.
    const renewalDate = input.renewal_iso.slice(0, 10);

    const { data, error } = await supabase
      .from("amc_contracts")
      .upsert(
        {
          customer_id: input.customer_id,
          tier: input.amc_tier,
          renewal_iso: renewalDate,
        },
        { onConflict: "customer_id" },
      )
      .select("id")
      .single();
    if (error) throw error;

    // Mirror the active tier on the customers row so the bot can short-circuit
    // tier-aware flows without joining amc_contracts on every turn.
    const { error: mirrorErr } = await supabase
      .from("customers")
      .update({ amc_tier: input.amc_tier })
      .eq("id", input.customer_id);
    if (mirrorErr) throw mirrorErr;

    log.info("update_amc_ok", {
      contract_id: data.id,
      customer_id: input.customer_id,
      tier: input.amc_tier,
      renewal: renewalDate,
    });
    return { ok: true, data: { id: data.id } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("update_amc_failed", { msg, customer_id: input.customer_id });
    return { ok: false, error: msg };
  }
}
