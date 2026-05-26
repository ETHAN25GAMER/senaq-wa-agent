// Deterministic state-machine "agent" — no LLM.
//
// Customer interactions are pure button MCQ, so every (stage, buttonId, ctx)
// triple has exactly one correct transition. This file is that table.
//
// Two things are persisted between turns (see supabase/queries.ts):
//   - wa_stage:   which screen the customer is on
//   - wa_context: intermediate selections (chosen service, slot, invoice id…)

import { dispatch } from "./tools/index.js";
import { t } from "./i18n/strings.js";
import type {
  AgentTurnResult,
  ButtonReply,
  Customer,
  OutboundButton,
  ServiceType,
  ToolName,
  WaContext,
  WaStage,
} from "./types.js";
import { log } from "./utils/logger.js";

interface HandleTurnArgs {
  customer: Customer;
  waStage: WaStage;
  waContext: WaContext;
  buttonReply: ButtonReply | null;
}

interface ToolCall {
  name: ToolName;
  input: Record<string, unknown>;
}

interface Transition {
  body: string;
  buttons: OutboundButton[];
  nextStage: WaStage;
  nextContext: WaContext;
  toolCalls?: ToolCall[];
}

export async function handleTurn({
  customer,
  waStage,
  waContext,
  buttonReply,
}: HandleTurnArgs): Promise<AgentTurnResult> {
  const buttonId = buttonReply?.buttonId ?? null;
  const transition = route(waStage, buttonId, customer, waContext);

  if (transition.toolCalls) {
    for (const call of transition.toolCalls) {
      const result = await dispatch(call.name, call.input);
      log.info("tool_dispatched", {
        name: call.name,
        ok: result.ok,
        todo: result.todo,
      });
    }
  }

  return {
    body: transition.body,
    buttons: transition.buttons,
    nextStage: transition.nextStage,
    nextContext: transition.nextContext,
  };
}

// ---------------------------------------------------------------------------
// Routing table
// ---------------------------------------------------------------------------

function route(
  stage: WaStage,
  buttonId: string | null,
  customer: Customer,
  ctx: WaContext,
): Transition {
  if (
    stage === "idle" ||
    stage === "done" ||
    buttonId === null ||
    buttonId === "menu"
  ) {
    return mainMenu();
  }

  switch (stage) {
    case "menu":
      return fromMenu(buttonId, customer, ctx);
    case "choose_service":
      return fromChooseService(buttonId, ctx);
    case "choose_date":
      return fromChooseDate(buttonId, ctx);
    case "choose_slot":
      return fromChooseSlot(buttonId, ctx);
    case "confirm_slot":
      return fromConfirmSlot(buttonId, customer, ctx);
    case "review_pending":
      return fromReviewPending(buttonId, ctx);
    case "review_positive":
      return fromReviewPositive(buttonId, customer, ctx);
    case "review_negative":
      return fromReviewNegative(buttonId, customer, ctx);
    case "reminder_ack":
      return fromReminderAck(buttonId, customer, ctx);
    case "awaiting_payment":
      return fromAwaitingPayment(buttonId, customer, ctx);
    case "payment_defer":
      return fromPaymentDefer(buttonId, customer, ctx);
    case "followup_pending":
      return fromFollowupPending(buttonId, ctx);
    case "complaint_triage":
    case "escalated":
      return mainMenu();
  }
}

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------

function mainMenu(): Transition {
  return {
    body: t("menu_welcome"),
    buttons: [
      { id: "book_service", title: t("btn_book_service") },
      { id: "amc_renewal", title: t("btn_amc_renewal") },
      { id: "other", title: t("btn_other") },
    ],
    nextStage: "menu",
    nextContext: {},
  };
}

function fromMenu(
  buttonId: string,
  customer: Customer,
  ctx: WaContext,
): Transition {
  switch (buttonId) {
    case "book_service":
      return {
        body: t("choose_service_prompt"),
        buttons: [
          { id: "svc_cockroach", title: t("btn_svc_cockroach") },
          { id: "svc_bed_bugs", title: t("btn_svc_bed_bugs") },
          { id: "svc_general", title: t("btn_svc_general") },
        ],
        nextStage: "choose_service",
        nextContext: {},
      };
    case "amc_renewal":
      return {
        body: t("amc_logged"),
        buttons: [{ id: "menu", title: t("btn_main_menu") }],
        nextStage: "done",
        nextContext: {},
        toolCalls: [
          {
            name: "update-amc",
            input: {
              customer_id: customer.id,
              amc_tier: "basic",
              renewal_iso: addDays(new Date(), 365).toISOString(),
            },
          },
        ],
      };
    case "other":
      return escalateAndAck(
        customer,
        ctx,
        "Customer chose 'Other' from main menu.",
        "low",
      );
    default:
      return mainMenu();
  }
}

// ---------------------------------------------------------------------------
// Booking flow
// ---------------------------------------------------------------------------

const SERVICE_BY_BUTTON: Record<string, ServiceType> = {
  svc_cockroach: "cockroach",
  svc_bed_bugs: "bed_bugs",
  svc_general: "general",
};

function fromChooseService(buttonId: string, ctx: WaContext): Transition {
  const service = SERVICE_BY_BUTTON[buttonId];
  if (!service) return mainMenu();

  return {
    body: t("choose_date_prompt"),
    buttons: [
      { id: "date_today", title: t("btn_date_today") },
      { id: "date_tomorrow", title: t("btn_date_tomorrow") },
      { id: "date_day_after", title: t("btn_date_day_after") },
    ],
    nextStage: "choose_date",
    nextContext: { ...ctx, service_type: service },
  };
}

function fromChooseDate(buttonId: string, ctx: WaContext): Transition {
  const offset =
    buttonId === "date_today"
      ? 0
      : buttonId === "date_tomorrow"
        ? 1
        : buttonId === "date_day_after"
          ? 2
          : -1;
  if (offset < 0) return mainMenu();

  const dateIso = ymd(addDays(new Date(), offset));

  return {
    body: t("choose_slot_prompt"),
    buttons: [
      { id: "slot_morning", title: t("btn_slot_morning") },
      { id: "slot_afternoon", title: t("btn_slot_afternoon") },
      { id: "slot_evening", title: t("btn_slot_evening") },
    ],
    nextStage: "choose_slot",
    nextContext: { ...ctx, date_iso: dateIso },
    toolCalls: [
      {
        name: "check-availability",
        input: { date: dateIso, service_type: ctx.service_type ?? "general" },
      },
    ],
  };
}

const SLOT_HOUR_BY_BUTTON: Record<string, number> = {
  slot_morning: 9,
  slot_afternoon: 14,
  slot_evening: 18,
};

function fromChooseSlot(buttonId: string, ctx: WaContext): Transition {
  const hour = SLOT_HOUR_BY_BUTTON[buttonId];
  if (hour === undefined || !ctx.date_iso) return mainMenu();

  const slotIso = combineDateAndHour(ctx.date_iso, hour);
  const human = humanSlot(ctx.date_iso, hour);

  return {
    body: t("confirm_slot_prompt", { slot: human }),
    buttons: [
      { id: "confirm_yes", title: t("btn_confirm_yes") },
      { id: "confirm_change", title: t("btn_confirm_change") },
      { id: "confirm_cancel", title: t("btn_confirm_cancel") },
    ],
    nextStage: "confirm_slot",
    nextContext: { ...ctx, slot_iso: slotIso },
  };
}

function fromConfirmSlot(
  buttonId: string,
  customer: Customer,
  ctx: WaContext,
): Transition {
  switch (buttonId) {
    case "confirm_yes": {
      if (!ctx.slot_iso || !ctx.service_type) return mainMenu();
      // Hard guard: never let a job be inserted with a placeholder address.
      // The buttons-only rule rules out asking the customer to type it in, so
      // we escalate to ops, who collect the address out of band.
      const address = customer.address?.trim();
      if (!address) {
        return {
          body: t("booking_needs_address"),
          buttons: [{ id: "menu", title: t("btn_main_menu") }],
          nextStage: "escalated",
          nextContext: {},
          toolCalls: [
            {
              name: "escalate-complaint",
              input: {
                customer_id: customer.id,
                reason: `Booking blocked: no address on file (service=${ctx.service_type}, slot=${ctx.slot_iso})`,
                severity: "low",
              },
            },
          ],
        };
      }
      return {
        body: t("booked_ack"),
        buttons: [{ id: "menu", title: t("btn_main_menu") }],
        nextStage: "done",
        nextContext: {},
        toolCalls: [
          {
            name: "insert-job",
            input: {
              customer_id: customer.id,
              service_type: ctx.service_type,
              slot_iso: ctx.slot_iso,
              address,
            },
          },
          {
            name: "schedule-reminder",
            input: {
              customer_id: customer.id,
              kind: "appointment",
              fire_at_iso: addHours(
                new Date(ctx.slot_iso),
                -24,
              ).toISOString(),
            },
          },
        ],
      };
    }
    case "confirm_change":
      return {
        body: t("change_time_prompt"),
        buttons: [
          { id: "date_today", title: t("btn_date_today") },
          { id: "date_tomorrow", title: t("btn_date_tomorrow") },
          { id: "date_day_after", title: t("btn_date_day_after") },
        ],
        nextStage: "choose_date",
        nextContext: { service_type: ctx.service_type },
      };
    case "confirm_cancel":
      return {
        body: t("booking_cancelled"),
        buttons: [{ id: "menu", title: t("btn_main_menu") }],
        nextStage: "done",
        nextContext: {},
      };
    default:
      return mainMenu();
  }
}

// ---------------------------------------------------------------------------
// Post-service review flow
// ---------------------------------------------------------------------------

function fromReviewPending(buttonId: string, ctx: WaContext): Transition {
  const carry = stripFollowupFields(ctx);
  switch (buttonId) {
    case "rate_great":
      return {
        body: t("review_great"),
        buttons: [
          { id: "review_yes", title: t("btn_review_yes") },
          { id: "review_later", title: t("btn_review_later") },
        ],
        nextStage: "review_positive",
        nextContext: carry,
      };
    case "rate_okay":
    case "rate_bad":
      return {
        body: t("review_bad"),
        buttons: [
          { id: "complaint_yes", title: t("btn_complaint_yes") },
          { id: "complaint_no", title: t("btn_complaint_no") },
        ],
        nextStage: "review_negative",
        nextContext: carry,
      };
    default:
      return mainMenu();
  }
}

function fromReviewPositive(
  buttonId: string,
  customer: Customer,
  ctx: WaContext,
): Transition {
  if (buttonId === "review_yes") {
    return {
      body: t("review_sent_thanks"),
      buttons: [{ id: "menu", title: t("btn_main_menu") }],
      nextStage: "done",
      nextContext: {},
      toolCalls: [
        {
          name: "send-review-link",
          input: {
            customer_id: customer.id,
            job_id: ctx.job_id ?? "TODO_job_id_placeholder",
          },
        },
      ],
    };
  }
  return {
    body: t("review_later_ack"),
    buttons: [{ id: "menu", title: t("btn_main_menu") }],
    nextStage: "done",
    nextContext: {},
  };
}

function fromReviewNegative(
  buttonId: string,
  customer: Customer,
  _ctx: WaContext,
): Transition {
  if (buttonId === "complaint_yes") {
    return {
      body: t("manager_will_call"),
      buttons: [{ id: "menu", title: t("btn_main_menu") }],
      nextStage: "escalated",
      nextContext: {},
      toolCalls: [
        {
          name: "escalate-complaint",
          input: {
            customer_id: customer.id,
            reason: "Negative post-service rating",
            severity: "high",
          },
        },
      ],
    };
  }
  return {
    body: t("feedback_thanks"),
    buttons: [{ id: "menu", title: t("btn_main_menu") }],
    nextStage: "done",
    nextContext: {},
  };
}

// ---------------------------------------------------------------------------
// Appointment reminder flow
// ---------------------------------------------------------------------------

function fromReminderAck(
  buttonId: string,
  customer: Customer,
  ctx: WaContext,
): Transition {
  switch (buttonId) {
    case "rem_confirm":
      return {
        body: t("reminder_confirmed"),
        buttons: [{ id: "menu", title: t("btn_main_menu") }],
        nextStage: "done",
        nextContext: {},
      };
    case "rem_reschedule":
      return {
        body: t("reschedule_prompt"),
        buttons: [
          { id: "svc_cockroach", title: t("btn_svc_cockroach") },
          { id: "svc_bed_bugs", title: t("btn_svc_bed_bugs") },
          { id: "svc_general", title: t("btn_svc_general") },
        ],
        nextStage: "choose_service",
        nextContext: {},
      };
    case "rem_cancel":
      return {
        body: t("visit_cancelled"),
        buttons: [{ id: "menu", title: t("btn_main_menu") }],
        nextStage: "done",
        nextContext: {},
        toolCalls: [
          {
            name: "escalate-complaint",
            input: {
              customer_id: customer.id,
              reason: `Customer cancelled reminded appointment (job=${ctx.job_id ?? "?"})`,
              severity: "low",
            },
          },
        ],
      };
    default:
      return mainMenu();
  }
}

// ---------------------------------------------------------------------------
// Invoice reminder flow
// ---------------------------------------------------------------------------

function fromAwaitingPayment(
  buttonId: string,
  customer: Customer,
  ctx: WaContext,
): Transition {
  switch (buttonId) {
    case "pay_now":
      return {
        body: t("pay_link_sent"),
        buttons: [{ id: "menu", title: t("btn_main_menu") }],
        nextStage: "done",
        nextContext: {},
        toolCalls: [
          {
            name: "generate-payment-link",
            input: {
              invoice_id: ctx.invoice_id ?? "TODO_invoice_id_placeholder",
              amount: ctx.invoice_amount ?? 0,
            },
          },
        ],
      };
    case "pay_later":
      return {
        body: t("pay_defer_prompt"),
        buttons: [
          { id: "defer_tomorrow", title: t("btn_defer_tomorrow") },
          { id: "defer_next_week", title: t("btn_defer_next_week") },
        ],
        nextStage: "payment_defer",
        nextContext: stripFollowupFields(ctx),
      };
    case "pay_dispute":
      return {
        body: t("dispute_flagged"),
        buttons: [{ id: "menu", title: t("btn_main_menu") }],
        nextStage: "escalated",
        nextContext: {},
        toolCalls: [
          {
            name: "escalate-complaint",
            input: {
              customer_id: customer.id,
              reason: `Invoice dispute (invoice=${ctx.invoice_id ?? "?"})`,
              severity: "medium",
            },
          },
        ],
      };
    default:
      return mainMenu();
  }
}

function fromPaymentDefer(
  buttonId: string,
  customer: Customer,
  _ctx: WaContext,
): Transition {
  const days = buttonId === "defer_next_week" ? 7 : 1;
  const durationKey = days === 7 ? "duration_a_week" : "duration_a_day";
  return {
    body: t("pay_defer_ack", { duration: t(durationKey) }),
    buttons: [{ id: "menu", title: t("btn_main_menu") }],
    nextStage: "done",
    nextContext: {},
    toolCalls: [
      {
        name: "schedule-reminder",
        input: {
          customer_id: customer.id,
          kind: "invoice",
          fire_at_iso: addDays(new Date(), days).toISOString(),
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Follow-up nudge flow
// ---------------------------------------------------------------------------

function fromFollowupPending(buttonId: string, ctx: WaContext): Transition {
  switch (buttonId) {
    case "fup_continue": {
      if (!ctx.last_prompt || !ctx.prev_stage) return mainMenu();
      return {
        body: ctx.last_prompt.body,
        buttons: ctx.last_prompt.buttons,
        nextStage: ctx.prev_stage,
        nextContext: stripFollowupFields(ctx),
      };
    }
    case "fup_restart":
      return mainMenu();
    case "fup_no":
      return {
        body: t("fup_no_ack"),
        buttons: [{ id: "menu", title: t("btn_main_menu") }],
        nextStage: "done",
        nextContext: {},
      };
    default:
      return mainMenu();
  }
}

function stripFollowupFields(ctx: WaContext): WaContext {
  // Drop follow-up bookkeeping fields; keep any flow-specific fields.
  const {
    prev_stage: _ps,
    last_prompt: _lp,
    followup1_sent_at: _f1,
    followup2_sent_at: _f2,
    ...rest
  } = ctx;
  return rest;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escalateAndAck(
  customer: Customer,
  _ctx: WaContext,
  reason: string,
  severity: "low" | "medium" | "high",
): Transition {
  return {
    body: t("escalate_ack"),
    buttons: [{ id: "menu", title: t("btn_main_menu") }],
    nextStage: "escalated",
    nextContext: {},
    toolCalls: [
      {
        name: "escalate-complaint",
        input: {
          customer_id: customer.id,
          reason,
          severity,
        },
      },
    ],
  };
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function addHours(d: Date, hours: number): Date {
  const out = new Date(d);
  out.setHours(out.getHours() + hours);
  return out;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function combineDateAndHour(dateYmd: string, hour: number): string {
  const d = new Date(`${dateYmd}T00:00:00.000Z`);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

function humanSlot(dateYmd: string, hour: number): string {
  const labelKey =
    hour < 12
      ? "slot_label_morning"
      : hour < 17
        ? "slot_label_afternoon"
        : "slot_label_evening";
  return t("confirm_slot_template", {
    date: dateYmd,
    label: t(labelKey),
    hour: String(hour).padStart(2, "0"),
  });
}
