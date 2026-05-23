import { supabase } from "./client.js";
import type { Customer, WaContext, WaStage } from "../types.js";

const TABLE = "customers";

export async function getCustomer(phone: string): Promise<Customer | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (error) throw error;
  return (data as Customer | null) ?? null;
}

export async function upsertCustomer(
  partial: Partial<Customer> & { phone: string },
): Promise<Customer> {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(partial, { onConflict: "phone" })
    .select("*")
    .single();

  if (error) throw error;
  return data as Customer;
}

export interface WaState {
  stage: WaStage;
  context: WaContext;
}

export async function getWaState(phone: string): Promise<WaState> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("wa_stage, wa_context")
    .eq("phone", phone)
    .maybeSingle();

  if (error) throw error;
  return {
    stage: (data?.wa_stage as WaStage | undefined) ?? "idle",
    context: (data?.wa_context as WaContext | undefined) ?? {},
  };
}

export async function setWaState(
  phone: string,
  stage: WaStage,
  context: WaContext,
): Promise<void> {
  const { error } = await supabase.from(TABLE).upsert(
    {
      phone,
      wa_stage: stage,
      wa_context: context,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "phone" },
  );

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// follow-up-nudge skill: scan for stale conversations.
// ---------------------------------------------------------------------------

export interface StaleBuckets {
  firstNudge: Customer[]; // 30m+ idle, never nudged
  secondNudge: Customer[]; // 1st nudge sent ≥ 2h ago, no 2nd yet
  toEscalate: Customer[]; // 2nd nudge sent ≥ 24h ago
}

const FIRST_NUDGE_MS = 30 * 60 * 1000; // 30 min
const SECOND_NUDGE_MS = 2 * 60 * 60 * 1000; // 2 h
const ESCALATE_MS = 24 * 60 * 60 * 1000; // 24 h

const ACTIVE_STAGES_FOR_NUDGE = [
  "menu",
  "choose_service",
  "choose_date",
  "choose_slot",
  "confirm_slot",
  "review_pending",
  "review_positive",
  "review_negative",
  "reminder_ack",
  "awaiting_payment",
  "payment_defer",
  "complaint_triage",
];

export async function findStaleCustomers(opts: {
  now: Date;
}): Promise<StaleBuckets> {
  const { now } = opts;

  // Pull every potentially-stale row in one query, bucket in JS. The set is
  // small (only customers actively in a flow); JS filtering keeps the query
  // simple and the JSONB predicates portable.
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .in("wa_stage", [...ACTIVE_STAGES_FOR_NUDGE, "followup_pending"]);

  if (error) throw error;

  const buckets: StaleBuckets = {
    firstNudge: [],
    secondNudge: [],
    toEscalate: [],
  };

  for (const row of (data ?? []) as Customer[]) {
    const ctx = (row.wa_context ?? {}) as WaContext;
    const updatedAt = new Date(row.updated_at).getTime();
    const nowMs = now.getTime();
    const idleMs = nowMs - updatedAt;

    // 2nd nudge already sent → check for escalation timeout
    if (ctx.followup2_sent_at) {
      if (nowMs - new Date(ctx.followup2_sent_at).getTime() >= ESCALATE_MS) {
        buckets.toEscalate.push(row);
      }
      continue;
    }

    // 1st nudge already sent → check for 2nd-nudge eligibility
    if (ctx.followup1_sent_at) {
      if (nowMs - new Date(ctx.followup1_sent_at).getTime() >= SECOND_NUDGE_MS) {
        buckets.secondNudge.push(row);
      }
      continue;
    }

    // No nudge yet → check for 1st-nudge eligibility.
    // Skip rows that are already in followup_pending without a stamp
    // (shouldn't happen but is harmless to skip).
    if (
      row.wa_stage !== "followup_pending" &&
      idleMs >= FIRST_NUDGE_MS
    ) {
      buckets.firstNudge.push(row);
    }
  }

  return buckets;
}
