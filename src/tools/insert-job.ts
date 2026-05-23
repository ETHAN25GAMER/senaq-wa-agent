import type { ToolResult } from "../types.js";

export interface InsertJobInput {
  customer_id: string;
  service_type: "cockroach" | "bed_bugs" | "general" | "amc_visit";
  slot_iso: string;
  address: string;
}

export async function handler(_input: InsertJobInput): Promise<ToolResult> {
  // TODO: insert into supabase `jobs` table, return job id.
  return { ok: true, todo: "implement insert-job" };
}
