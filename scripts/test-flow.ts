// CLI flow runner for the SENAQ WhatsApp router.
//
// Walks every skill scenario turn-by-turn against src/agent.ts. No Supabase,
// no Meta, no env vars required — just exercises the deterministic state
// machine and prints what the customer would see at each step.
//
// Run with:   npx tsx scripts/test-flow.ts
// Or filter:  npx tsx scripts/test-flow.ts booking

import { handleTurn } from "../src/agent.js";
import type {
  ButtonReply,
  Customer,
  WaContext,
  WaStage,
} from "../src/types.js";

interface Step {
  buttonId: string | null; // null = initial trigger (no button pressed)
  note?: string;
}

interface Scenario {
  name: string;
  skill: string;
  startStage: WaStage;
  startContext: WaContext;
  steps: Step[];
}

const FAKE_CUSTOMER: Customer = {
  id: "cust_test_001",
  phone: "971500000000",
  name: "Test Customer",
  address: "Test Address, Dubai",
  amc_tier: "none",
  wa_stage: "idle",
  wa_context: {},
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const SCENARIOS: Scenario[] = [
  // ----- appointment chatbot -----
  {
    name: "Booking — happy path",
    skill: "booking",
    startStage: "idle",
    startContext: {},
    steps: [
      { buttonId: null, note: "customer opens chat" },
      { buttonId: "book_service" },
      { buttonId: "svc_cockroach" },
      { buttonId: "date_tomorrow" },
      { buttonId: "slot_afternoon" },
      { buttonId: "confirm_yes" },
    ],
  },
  {
    name: "Booking — change time then confirm",
    skill: "booking",
    startStage: "idle",
    startContext: {},
    steps: [
      { buttonId: null },
      { buttonId: "book_service" },
      { buttonId: "svc_bed_bugs" },
      { buttonId: "date_today" },
      { buttonId: "slot_morning" },
      { buttonId: "confirm_change" },
      { buttonId: "date_day_after" },
      { buttonId: "slot_evening" },
      { buttonId: "confirm_yes" },
    ],
  },
  {
    name: "Booking — cancel at confirmation",
    skill: "booking",
    startStage: "idle",
    startContext: {},
    steps: [
      { buttonId: null },
      { buttonId: "book_service" },
      { buttonId: "svc_general" },
      { buttonId: "date_today" },
      { buttonId: "slot_morning" },
      { buttonId: "confirm_cancel" },
    ],
  },
  {
    name: "AMC renewal from menu",
    skill: "booking",
    startStage: "idle",
    startContext: {},
    steps: [
      { buttonId: null },
      { buttonId: "amc_renewal" },
    ],
  },
  {
    name: "Other → escalation",
    skill: "booking",
    startStage: "idle",
    startContext: {},
    steps: [
      { buttonId: null },
      { buttonId: "other" },
    ],
  },

  // ----- post-service review -----
  {
    name: "Review — Great → leave review",
    skill: "review",
    startStage: "review_pending",
    startContext: { job_id: "job_demo_42" },
    steps: [
      { buttonId: "rate_great", note: "customer rates the visit" },
      { buttonId: "review_yes" },
    ],
  },
  {
    name: "Review — Great → maybe later",
    skill: "review",
    startStage: "review_pending",
    startContext: { job_id: "job_demo_42" },
    steps: [
      { buttonId: "rate_great" },
      { buttonId: "review_later" },
    ],
  },
  {
    name: "Review — Bad → talk to manager",
    skill: "review",
    startStage: "review_pending",
    startContext: { job_id: "job_demo_42" },
    steps: [
      { buttonId: "rate_bad" },
      { buttonId: "complaint_yes" },
    ],
  },
  {
    name: "Review — Okay → no thanks",
    skill: "review",
    startStage: "review_pending",
    startContext: { job_id: "job_demo_42" },
    steps: [
      { buttonId: "rate_okay" },
      { buttonId: "complaint_no" },
    ],
  },

  // ----- appointment reminders -----
  {
    name: "Reminder — confirm",
    skill: "reminders",
    startStage: "reminder_ack",
    startContext: {
      job_id: "job_demo_42",
      slot_iso: "2026-05-21T09:00:00.000Z",
    },
    steps: [{ buttonId: "rem_confirm" }],
  },
  {
    name: "Reminder — reschedule",
    skill: "reminders",
    startStage: "reminder_ack",
    startContext: { job_id: "job_demo_42" },
    steps: [
      { buttonId: "rem_reschedule" },
      { buttonId: "svc_general" },
      { buttonId: "date_tomorrow" },
      { buttonId: "slot_morning" },
      { buttonId: "confirm_yes" },
    ],
  },
  {
    name: "Reminder — cancel",
    skill: "reminders",
    startStage: "reminder_ack",
    startContext: { job_id: "job_demo_42" },
    steps: [{ buttonId: "rem_cancel" }],
  },

  // ----- invoice reminders -----
  {
    name: "Invoice — pay now",
    skill: "invoice",
    startStage: "awaiting_payment",
    startContext: { invoice_id: "inv_demo_77", invoice_amount_aed: 450 },
    steps: [{ buttonId: "pay_now" }],
  },
  {
    name: "Invoice — pay later → tomorrow",
    skill: "invoice",
    startStage: "awaiting_payment",
    startContext: { invoice_id: "inv_demo_77", invoice_amount_aed: 450 },
    steps: [{ buttonId: "pay_later" }, { buttonId: "defer_tomorrow" }],
  },
  {
    name: "Invoice — pay later → next week",
    skill: "invoice",
    startStage: "awaiting_payment",
    startContext: { invoice_id: "inv_demo_77", invoice_amount_aed: 450 },
    steps: [{ buttonId: "pay_later" }, { buttonId: "defer_next_week" }],
  },
  {
    name: "Invoice — dispute",
    skill: "invoice",
    startStage: "awaiting_payment",
    startContext: { invoice_id: "inv_demo_77", invoice_amount_aed: 450 },
    steps: [{ buttonId: "pay_dispute" }],
  },

  // ----- follow-up nudge -----
  {
    name: "Follow-up — Continue resumes prev stage",
    skill: "followup",
    startStage: "followup_pending",
    startContext: {
      prev_stage: "choose_slot",
      service_type: "cockroach",
      date_iso: "2026-05-20",
      last_prompt: {
        body: "Pick a time slot:",
        buttons: [
          { id: "slot_morning", title: "Morning" },
          { id: "slot_afternoon", title: "Afternoon" },
          { id: "slot_evening", title: "Evening" },
        ],
      },
      followup1_sent_at: "2026-05-19T10:00:00.000Z",
    },
    steps: [
      { buttonId: "fup_continue", note: "customer comes back" },
    ],
  },
  {
    name: "Follow-up — Start over goes to main menu",
    skill: "followup",
    startStage: "followup_pending",
    startContext: {
      prev_stage: "choose_slot",
      last_prompt: {
        body: "Pick a time slot:",
        buttons: [{ id: "slot_morning", title: "Morning" }],
      },
      followup1_sent_at: "2026-05-19T10:00:00.000Z",
    },
    steps: [{ buttonId: "fup_restart" }],
  },
  {
    name: "Follow-up — No thanks closes politely",
    skill: "followup",
    startStage: "followup_pending",
    startContext: {
      prev_stage: "confirm_slot",
      last_prompt: {
        body: "Confirm: 2026-05-20 morning?",
        buttons: [{ id: "confirm_yes", title: "Confirm" }],
      },
      followup1_sent_at: "2026-05-19T10:00:00.000Z",
    },
    steps: [{ buttonId: "fup_no" }],
  },
  {
    name: "Follow-up — Continue without last_prompt falls back to menu",
    skill: "followup",
    startStage: "followup_pending",
    startContext: {
      // intentionally missing last_prompt / prev_stage
      followup1_sent_at: "2026-05-19T10:00:00.000Z",
    },
    steps: [{ buttonId: "fup_continue" }],
  },

  // ----- language picker (i18n) -----
  // Override the runScenario default by explicitly omitting `language` so the
  // router shows the bilingual picker.
  {
    name: "Language — first turn shows picker",
    skill: "language",
    startStage: "idle",
    startContext: { language: undefined }, // unset so picker triggers
    steps: [{ buttonId: null, note: "fresh customer" }],
  },
  {
    name: "Language — pick English",
    skill: "language",
    startStage: "choose_language",
    startContext: { language: undefined },
    steps: [{ buttonId: "lang_en" }],
  },
  {
    name: "Language — pick Arabic",
    skill: "language",
    startStage: "choose_language",
    startContext: { language: undefined },
    steps: [{ buttonId: "lang_ar" }],
  },
  {
    name: "Language — Arabic booking happy path",
    skill: "language",
    startStage: "menu",
    startContext: { language: "ar" },
    steps: [
      { buttonId: "book_service" },
      { buttonId: "svc_cockroach" },
      { buttonId: "date_tomorrow" },
      { buttonId: "slot_morning" },
      { buttonId: "confirm_yes" },
    ],
  },
  {
    name: "Language — follow-up resume preserves Arabic prompt",
    skill: "language",
    startStage: "followup_pending",
    startContext: {
      language: "ar",
      prev_stage: "choose_slot",
      service_type: "cockroach",
      date_iso: "2026-05-20",
      last_prompt: {
        body: "اختر الوقت المناسب:",
        buttons: [
          { id: "slot_morning", title: "صباحاً" },
          { id: "slot_afternoon", title: "ظهراً" },
          { id: "slot_evening", title: "مساءً" },
        ],
      },
      followup1_sent_at: "2026-05-19T10:00:00.000Z",
    },
    steps: [{ buttonId: "fup_continue" }],
  },
];

// ---------------------------------------------------------------------------

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
};

async function runScenario(s: Scenario): Promise<{ passed: boolean; reason?: string }> {
  console.log(
    `\n${C.bold}${C.cyan}── ${s.name}${C.reset} ${C.dim}[${s.skill}]${C.reset}`,
  );
  console.log(
    `${C.dim}   start stage=${s.startStage} context=${JSON.stringify(s.startContext)}${C.reset}`,
  );

  let stage: WaStage = s.startStage;
  // Default language to English unless the scenario sets one — keeps the
  // 20 pre-i18n scenarios working without explicit `language: "en"` on each.
  let context: WaContext = { language: "en", ...s.startContext };

  for (let i = 0; i < s.steps.length; i++) {
    const step = s.steps[i]!;

    const buttonReply: ButtonReply | null = step.buttonId
      ? {
          from: FAKE_CUSTOMER.phone,
          buttonId: step.buttonId,
          buttonTitle: step.buttonId,
          messageId: `msg_${i}`,
        }
      : null;

    let result;
    try {
      result = await handleTurn({
        customer: { ...FAKE_CUSTOMER, wa_stage: stage, wa_context: context },
        waStage: stage,
        waContext: context,
        buttonReply,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`${C.red}   ✗ step ${i + 1} threw: ${msg}${C.reset}`);
      return { passed: false, reason: msg };
    }

    const pressed = step.buttonId ? `pressed "${step.buttonId}"` : "(no button)";
    const note = step.note ? ` ${C.dim}— ${step.note}${C.reset}` : "";
    console.log(`\n   ${C.yellow}▶ step ${i + 1}: ${pressed}${C.reset}${note}`);
    console.log(`     ${C.green}body${C.reset}    ${result.body}`);
    console.log(
      `     ${C.green}buttons${C.reset} ${result.buttons
        .map((b) => `[${b.id}: "${b.title}"]`)
        .join("  ")}`,
    );
    console.log(
      `     ${C.green}stage${C.reset}   ${stage} ${C.dim}→${C.reset} ${C.magenta}${result.nextStage}${C.reset}`,
    );
    if (Object.keys(result.nextContext).length > 0) {
      console.log(
        `     ${C.green}context${C.reset} ${JSON.stringify(result.nextContext)}`,
      );
    }

    stage = result.nextStage;
    context = result.nextContext;
  }

  return { passed: true };
}

async function main(): Promise<void> {
  const filter = process.argv[2]?.toLowerCase();
  const selected = filter
    ? SCENARIOS.filter(
        (s) =>
          s.skill.toLowerCase().includes(filter) ||
          s.name.toLowerCase().includes(filter),
      )
    : SCENARIOS;

  if (selected.length === 0) {
    console.error(`No scenarios matched filter: ${filter}`);
    process.exit(2);
  }

  console.log(
    `${C.bold}SENAQ flow runner${C.reset} — ${selected.length} scenario(s)`,
  );

  let passed = 0;
  let failed = 0;
  for (const scenario of selected) {
    const result = await runScenario(scenario);
    if (result.passed) passed++;
    else failed++;
  }

  console.log(
    `\n${C.bold}Result:${C.reset} ${C.green}${passed} passed${C.reset}` +
      (failed ? `, ${C.red}${failed} failed${C.reset}` : ""),
  );
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
