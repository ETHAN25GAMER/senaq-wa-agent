import type { ToolResult } from "../types.js";

export interface GeneratePaymentLinkInput {
  invoice_id: string;
  amount_aed: number;
}

export async function handler(
  _input: GeneratePaymentLinkInput,
): Promise<ToolResult> {
  // TODO: call payment provider (Stripe / Telr / Network), return short URL.
  return {
    ok: true,
    todo: "implement generate-payment-link",
    data: { url: "https://pay.example.com/placeholder" },
  };
}
