export type WaStage =
  | "idle"
  | "menu"
  | "choose_service"
  | "choose_date"
  | "choose_slot"
  | "confirm_slot"
  | "awaiting_payment"
  | "payment_defer"
  | "review_pending"
  | "review_positive"
  | "review_negative"
  | "reminder_ack"
  | "complaint_triage"
  | "escalated"
  | "followup_pending"
  | "done";

export type ServiceType = "cockroach" | "bed_bugs" | "general" | "amc_visit";

export interface WaContext {
  service_type?: ServiceType;
  date_iso?: string; // YYYY-MM-DD
  slot_iso?: string; // full ISO datetime of the chosen slot
  job_id?: string;
  invoice_id?: string;
  invoice_amount?: number;

  // follow-up-nudge skill state
  prev_stage?: WaStage;
  last_prompt?: { body: string; buttons: OutboundButton[] };
  followup1_sent_at?: string; // ISO timestamp
  followup2_sent_at?: string; // ISO timestamp
}

export interface Customer {
  id: string;
  phone: string;
  name: string | null;
  address: string | null;
  amc_tier: "none" | "basic" | "premium" | null;
  wa_stage: WaStage;
  wa_context: WaContext;
  created_at: string;
  updated_at: string;
}

export interface ButtonReply {
  from: string;
  buttonId: string;
  buttonTitle: string;
  messageId: string;
}

export interface OutboundButton {
  id: string;
  title: string;
}

export interface AgentTurnResult {
  nextStage: WaStage;
  nextContext: WaContext;
  body: string;
  buttons: OutboundButton[];
}

export type ToolName =
  | "check-availability"
  | "insert-job"
  | "update-amc"
  | "generate-payment-link"
  | "escalate-complaint"
  | "schedule-reminder"
  | "send-review-link";

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  todo?: string;
}
