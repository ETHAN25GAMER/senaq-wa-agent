import { supabase } from "../supabase/client.js";
import { log } from "../utils/logger.js";
import type { ToolResult } from "../types.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ScheduleReminderInput {
  customer_id: string;
  kind: "appointment" | "invoice";
  fire_at_iso: string;
  payload?: Record<string, unknown>;
}

export async function handler(
  input: ScheduleReminderInput,
): Promise<ToolResult> {
  if (!UUID_RE.test(input.customer_id)) {
    log.warn("schedule_reminder_bad_customer_id", {
      customer_id: input.customer_id,
    });
    return { ok: false, error: "invalid customer_id" };
  }
  try {
    const { data, error } = await supabase
      .from("reminders")
      .insert({
        customer_id: input.customer_id,
        kind: input.kind,
        fire_at_iso: input.fire_at_iso,
        payload: input.payload ?? {},
      })
      .select("id")
      .single();
    if (error) throw error;
    log.info("schedule_reminder_ok", {
      reminder_id: data.id,
      customer_id: input.customer_id,
      kind: input.kind,
      fire_at: input.fire_at_iso,
    });
    return { ok: true, data: { id: data.id } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("schedule_reminder_failed", { msg });
    return { ok: false, error: msg };
  }
}
