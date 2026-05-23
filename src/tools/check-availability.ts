import type { ToolResult } from "../types.js";

export interface CheckAvailabilityInput {
  date: string;
  service_type: "cockroach" | "bed_bugs" | "general" | "amc_visit";
}

export async function handler(
  _input: CheckAvailabilityInput,
): Promise<ToolResult> {
  // TODO: query scheduling backend / ops calendar.
  return { ok: true, todo: "implement check-availability" };
}
