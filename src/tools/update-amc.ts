import type { ToolResult } from "../types.js";

export interface UpdateAmcInput {
  customer_id: string;
  amc_tier: "none" | "basic" | "premium";
  renewal_iso: string;
}

export async function handler(_input: UpdateAmcInput): Promise<ToolResult> {
  // TODO: upsert into `amc_contracts` and mirror tier on customers row.
  return { ok: true, todo: "implement update-amc" };
}
