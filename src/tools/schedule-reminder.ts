import type { ToolResult } from "../types.js";

export interface ScheduleReminderInput {
  customer_id: string;
  kind: "appointment" | "invoice";
  fire_at_iso: string;
}

export async function handler(
  _input: ScheduleReminderInput,
): Promise<ToolResult> {
  // TODO: insert row into `reminders` table; a cron worker fires the message.
  return { ok: true, todo: "implement schedule-reminder" };
}
