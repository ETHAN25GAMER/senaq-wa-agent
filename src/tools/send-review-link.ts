import type { ToolResult } from "../types.js";

export interface SendReviewLinkInput {
  customer_id: string;
  job_id: string;
}

export async function handler(
  _input: SendReviewLinkInput,
): Promise<ToolResult> {
  // TODO: send WA message with the review link button.
  return { ok: true, todo: "implement send-review-link" };
}
