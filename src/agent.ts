// Deterministic state-machine "agent" — no LLM.
//
// Customer interactions are pure button MCQ, so every (stage, buttonId, ctx)
// triple has exactly one correct transition. This file is that table.
//
// Two things are persisted between turns (see supabase/queries.ts):
//   - wa_stage:   which screen the customer is on
//   - wa_context: intermediate selections (chosen service, slot, invoice id…)
//
// Strings are localized via src/i18n/strings.ts — language is read from
// wa_context.language (defaults to "en" if missing).

import { dispatch } from "./tools/index.js";
import { t, type Language } from "./i18n/strings.js";
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
  // First-ever turn: show language picker before anything else.
  if (stage === "idle" && !ctx.language) {
    return chooseLanguagePrompt(ctx);
  }

  // Language picker reply.
  if (stage === "choose_language") {
    return fromChooseLanguage(buttonId, ctx);
  }

  const lang: Language = ctx.language ?? "en";

  if (
    stage === "idle" ||
    stage === "done" ||
    buttonId === null ||
    buttonId === "menu"
  ) {
    return mainMenu(lang, ctx);
  }

  switch (stage) {
    case "menu":
      return fromMenu(buttonId, lang, ctx);
    case "choose_service":
      return fromChooseService(buttonId, lang, ctx);
    case "choose_date":
      return fromChooseDate(buttonId, lang, ctx);
    case "choose_slot":
      return fromChooseSlot(buttonId, lang, ctx);
    case "confirm_slot":
      return fromConfirmSlot(buttonId, lang, customer, ctx);
    case "review_pending":
      return fromReviewPending(buttonId, lang, ctx);
    case "review_positive":
      return fromReviewPositive(buttonId, lang, customer, ctx);
    case "review_negative":
      return fromReviewNegative(buttonId, lang, customer, ctx);
    case "reminder_ack":
      return fromReminderAck(buttonId, lang, customer, ctx);
    case "awaiting_payment":
      return fromAwaitingPayment(buttonId, lang, customer, ctx);
    case "payment_defer":
      return fromPaymentDefer(buttonId, lang, customer, ctx);
    case "followup_pending":
      return fromFollowupPending(buttonId, lang, ctx);
    case "complaint_triage":
    case "escalated":
      return mainMenu(lang, ctx);
  }
}

// ---------------------------------------------------------------------------
// Language picker (pre-language)
// ---------------------------------------------------------------------------

function chooseLanguagePrompt(ctx: WaContext): Transition {
  // Uses the bilingual prompt string from the en table (same string lives in ar).
  return {
    body: t("en", "lang_picker_prompt"),
    buttons: [
      { id: "lang_en", title: t("en", "btn_lang_en") },
      { id: "lang_ar", title: t("en", "btn_lang_ar") },
    ],
    nextStage: "choose_language",
    nextContext: ctx,
  };
}

function fromChooseLanguage(
  buttonId: string | null,
  ctx: WaContext,
): Transition {
  const lang: Language | null =
    buttonId === "lang_en" ? "en" : buttonId === "lang_ar" ? "ar" : null;
  if (!lang) return chooseLanguagePrompt(ctx);
  const nextCtx: WaContext = { ...ctx, language: lang };
  return mainMenu(lang, nextCtx);
}

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------

function mainMenu(lang: Language, ctx: WaContext): Transition {
  // Preserve language across menu resets; clear everything else.
  return {
    body: t(lang, "menu_welcome"),
    buttons: [
      { id: "book_service", title: t(lang, "btn_book_service") },
      { id: "amc_renewal", title: t(lang, "btn_amc_renewal") },
      { id: "other", title: t(lang, "btn_other") },
    ],
    nextStage: "menu",
    nextContext: { language: ctx.language ?? lang },
  };
}

function fromMenu(
  buttonId: string,
  lang: Language,
  ctx: WaContext,
): Transition {
  switch (buttonId) {
    case "book_service":
      return {
        body: t(lang, "choose_service_prompt"),
        buttons: [
          { id: "svc_cockroach", title: t(lang, "btn_svc_cockroach") },
          { id: "svc_bed_bugs", title: t(lang, "btn_svc_bed_bugs") },
          { id: "svc_general", title: t(lang, "btn_svc_general") },
        ],
        nextStage: "choose_service",
        nextContext: { language: lang },
      };
    case "amc_renewal":
      return {
        body: t(lang, "amc_logged"),
        buttons: [{ id: "menu", title: t(lang, "btn_main_menu") }],
        nextStage: "done",
        nextContext: { language: lang },
        toolCalls: [
          {
            name: "update-amc",
            input: {
              customer_id: "TODO_customer_id_placeholder",
              amc_tier: "basic",
              renewal_iso: addDays(new Date(), 365).toISOString(),
            },
          },
        ],
      };
    case "other":
      return escalateAndAck(
        lang,
        ctx,
        "Customer chose 'Other' from main menu.",
        "low",
      );
    default:
      return mainMenu(lang, ctx);
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

function fromChooseService(
  buttonId: string,
  lang: Language,
  ctx: WaContext,
): Transition {
  const service = SERVICE_BY_BUTTON[buttonId];
  if (!service) return mainMenu(lang, ctx);

  return {
    body: t(lang, "choose_date_prompt"),
    buttons: [
      { id: "date_today", title: t(lang, "btn_date_today") },
      { id: "date_tomorrow", title: t(lang, "btn_date_tomorrow") },
      { id: "date_day_after", title: t(lang, "btn_date_day_after") },
    ],
    nextStage: "choose_date",
    nextContext: { ...ctx, service_type: service },
  };
}

function fromChooseDate(
  buttonId: string,
  lang: Language,
  ctx: WaContext,
): Transition {
  const offset =
    buttonId === "date_today"
      ? 0
      : buttonId === "date_tomorrow"
        ? 1
        : buttonId === "date_day_after"
          ? 2
          : -1;
  if (offset < 0) return mainMenu(lang, ctx);

  const dateIso = ymd(addDays(new Date(), offset));

  return {
    body: t(lang, "choose_slot_prompt"),
    buttons: [
      { id: "slot_morning", title: t(lang, "btn_slot_morning") },
      { id: "slot_afternoon", title: t(lang, "btn_slot_afternoon") },
      { id: "slot_evening", title: t(lang, "btn_slot_evening") },
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

function fromChooseSlot(
  buttonId: string,
  lang: Language,
  ctx: WaContext,
): Transition {
  const hour = SLOT_HOUR_BY_BUTTON[buttonId];
  if (hour === undefined || !ctx.date_iso) return mainMenu(lang, ctx);

  const slotIso = combineDateAndHour(ctx.date_iso, hour);
  const human = humanSlot(lang, ctx.date_iso, hour);

  return {
    body: t(lang, "confirm_slot_prompt", { slot: human }),
    buttons: [
      { id: "confirm_yes", title: t(lang, "btn_confirm_yes") },
      { id: "confirm_change", title: t(lang, "btn_confirm_change") },
      { id: "confirm_cancel", title: t(lang, "btn_confirm_cancel") },
    ],
    nextStage: "confirm_slot",
    nextContext: { ...ctx, slot_iso: slotIso },
  };
}

function fromConfirmSlot(
  buttonId: string,
  lang: Language,
  customer: Customer,
  ctx: WaContext,
): Transition {
  switch (buttonId) {
    case "confirm_yes": {
      if (!ctx.slot_iso || !ctx.service_type) return mainMenu(lang, ctx);
      return {
        body: t(lang, "booked_ack"),
        buttons: [{ id: "menu", title: t(lang, "btn_main_menu") }],
        nextStage: "done",
        nextContext: { language: lang },
        toolCalls: [
          {
            name: "insert-job",
            input: {
              customer_id: customer.id,
              service_type: ctx.service_type,
              slot_iso: ctx.slot_iso,
              address: customer.address ?? "TODO_address_placeholder",
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
        body: t(lang, "change_time_prompt"),
        buttons: [
          { id: "date_today", title: t(lang, "btn_date_today") },
          { id: "date_tomorrow", title: t(lang, "btn_date_tomorrow") },
          { id: "date_day_after", title: t(lang, "btn_date_day_after") },
        ],
        nextStage: "choose_date",
        nextContext: { language: lang, service_type: ctx.service_type },
      };
    case "confirm_cancel":
      return {
        body: t(lang, "booking_cancelled"),
        buttons: [{ id: "menu", title: t(lang, "btn_main_menu") }],
        nextStage: "done",
        nextContext: { language: lang },
      };
    default:
      return mainMenu(lang, ctx);
  }
}

// ---------------------------------------------------------------------------
// Post-service review flow
// ---------------------------------------------------------------------------

function fromReviewPending(
  buttonId: string,
  lang: Language,
  ctx: WaContext,
): Transition {
  switch (buttonId) {
    case "rate_great":
      return {
        body: t(lang, "review_great"),
        buttons: [
          { id: "review_yes", title: t(lang, "btn_review_yes") },
          { id: "review_later", title: t(lang, "btn_review_later") },
        ],
        nextStage: "review_positive",
        nextContext: ctx,
      };
    case "rate_okay":
    case "rate_bad":
      return {
        body: t(lang, "review_bad"),
        buttons: [
          { id: "complaint_yes", title: t(lang, "btn_complaint_yes") },
          { id: "complaint_no", title: t(lang, "btn_complaint_no") },
        ],
        nextStage: "review_negative",
        nextContext: ctx,
      };
    default:
      return mainMenu(lang, ctx);
  }
}

function fromReviewPositive(
  buttonId: string,
  lang: Language,
  customer: Customer,
  ctx: WaContext,
): Transition {
  if (buttonId === "review_yes") {
    return {
      body: t(lang, "review_sent_thanks"),
      buttons: [{ id: "menu", title: t(lang, "btn_main_menu") }],
      nextStage: "done",
      nextContext: { language: lang },
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
    body: t(lang, "review_later_ack"),
    buttons: [{ id: "menu", title: t(lang, "btn_main_menu") }],
    nextStage: "done",
    nextContext: { language: lang },
  };
}

function fromReviewNegative(
  buttonId: string,
  lang: Language,
  customer: Customer,
  _ctx: WaContext,
): Transition {
  if (buttonId === "complaint_yes") {
    return {
      body: t(lang, "manager_will_call"),
      buttons: [{ id: "menu", title: t(lang, "btn_main_menu") }],
      nextStage: "escalated",
      nextContext: { language: lang },
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
    body: t(lang, "feedback_thanks"),
    buttons: [{ id: "menu", title: t(lang, "btn_main_menu") }],
    nextStage: "done",
    nextContext: { language: lang },
  };
}

// ---------------------------------------------------------------------------
// Appointment reminder flow
// ---------------------------------------------------------------------------

function fromReminderAck(
  buttonId: string,
  lang: Language,
  customer: Customer,
  ctx: WaContext,
): Transition {
  switch (buttonId) {
    case "rem_confirm":
      return {
        body: t(lang, "reminder_confirmed"),
        buttons: [{ id: "menu", title: t(lang, "btn_main_menu") }],
        nextStage: "done",
        nextContext: { language: lang },
      };
    case "rem_reschedule":
      return {
        body: t(lang, "reschedule_prompt"),
        buttons: [
          { id: "svc_cockroach", title: t(lang, "btn_svc_cockroach") },
          { id: "svc_bed_bugs", title: t(lang, "btn_svc_bed_bugs") },
          { id: "svc_general", title: t(lang, "btn_svc_general") },
        ],
        nextStage: "choose_service",
        nextContext: { language: lang },
      };
    case "rem_cancel":
      return {
        body: t(lang, "visit_cancelled"),
        buttons: [{ id: "menu", title: t(lang, "btn_main_menu") }],
        nextStage: "done",
        nextContext: { language: lang },
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
      return mainMenu(lang, ctx);
  }
}

// ---------------------------------------------------------------------------
// Invoice reminder flow
// ---------------------------------------------------------------------------

function fromAwaitingPayment(
  buttonId: string,
  lang: Language,
  customer: Customer,
  ctx: WaContext,
): Transition {
  switch (buttonId) {
    case "pay_now":
      return {
        body: t(lang, "pay_link_sent"),
        buttons: [{ id: "menu", title: t(lang, "btn_main_menu") }],
        nextStage: "done",
        nextContext: { language: lang },
        toolCalls: [
          {
            name: "generate-payment-link",
            input: {
              invoice_id: ctx.invoice_id ?? "TODO_invoice_id_placeholder",
              amount_aed: ctx.invoice_amount_aed ?? 0,
            },
          },
        ],
      };
    case "pay_later":
      return {
        body: t(lang, "pay_defer_prompt"),
        buttons: [
          { id: "defer_tomorrow", title: t(lang, "btn_defer_tomorrow") },
          { id: "defer_next_week", title: t(lang, "btn_defer_next_week") },
        ],
        nextStage: "payment_defer",
        nextContext: ctx,
      };
    case "pay_dispute":
      return {
        body: t(lang, "dispute_flagged"),
        buttons: [{ id: "menu", title: t(lang, "btn_main_menu") }],
        nextStage: "escalated",
        nextContext: { language: lang },
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
      return mainMenu(lang, ctx);
  }
}

function fromPaymentDefer(
  buttonId: string,
  lang: Language,
  customer: Customer,
  _ctx: WaContext,
): Transition {
  const days = buttonId === "defer_next_week" ? 7 : 1;
  const durationKey = days === 7 ? "duration_a_week" : "duration_a_day";
  return {
    body: t(lang, "pay_defer_ack", { duration: t(lang, durationKey) }),
    buttons: [{ id: "menu", title: t(lang, "btn_main_menu") }],
    nextStage: "done",
    nextContext: { language: lang },
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

function fromFollowupPending(
  buttonId: string,
  lang: Language,
  ctx: WaContext,
): Transition {
  switch (buttonId) {
    case "fup_continue": {
      if (!ctx.last_prompt || !ctx.prev_stage) return mainMenu(lang, ctx);
      return {
        body: ctx.last_prompt.body,
        buttons: ctx.last_prompt.buttons,
        nextStage: ctx.prev_stage,
        nextContext: stripFollowupFields(ctx),
      };
    }
    case "fup_restart":
      return mainMenu(lang, ctx);
    case "fup_no":
      return {
        body: t(lang, "fup_no_ack"),
        buttons: [{ id: "menu", title: t(lang, "btn_main_menu") }],
        nextStage: "done",
        nextContext: { language: lang },
      };
    default:
      return mainMenu(lang, ctx);
  }
}

function stripFollowupFields(ctx: WaContext): WaContext {
  // Keep `language` and any flow-specific fields, drop only follow-up bookkeeping.
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
  lang: Language,
  _ctx: WaContext,
  reason: string,
  severity: "low" | "medium" | "high",
): Transition {
  return {
    body: t(lang, "escalate_ack"),
    buttons: [{ id: "menu", title: t(lang, "btn_main_menu") }],
    nextStage: "escalated",
    nextContext: { language: lang },
    toolCalls: [
      {
        name: "escalate-complaint",
        input: {
          customer_id: "TODO_customer_id_placeholder",
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

function humanSlot(lang: Language, dateYmd: string, hour: number): string {
  const labelKey =
    hour < 12
      ? "slot_label_morning"
      : hour < 17
        ? "slot_label_afternoon"
        : "slot_label_evening";
  return t(lang, "confirm_slot_template", {
    date: dateYmd,
    label: t(lang, labelKey),
    hour: String(hour).padStart(2, "0"),
  });
}
