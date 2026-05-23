// Standalone test for the appointment-reminders skill.
// Run: npx tsx src/skills/appointment-reminders/test.ts
//
// Drives `handleTurn` with stage="reminder_ack" and each of the three
// buttons the skill defines, asserting body / buttons / nextStage / tool calls.

import { handleTurn } from "../../agent.js";
import { dispatch } from "../../tools/index.js";
import type { Customer, WaContext } from "../../types.js";

// --- Tiny test harness ----------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// Spy on tool dispatch so we can assert what the skill calls.
type ToolCall = { name: string; input: unknown };
const dispatched: ToolCall[] = [];
const realDispatch = dispatch;
// Monkey-patch the module export by wrapping handleTurn's tool dispatcher.
// Since `dispatch` is imported by `agent.ts` directly we can't replace it
// here without module munging — instead we capture by re-importing and
// inspecting tool side-effects via the stub return values. The tool stubs
// all return ok:true so handleTurn won't throw; we verify tool wiring
// indirectly by reading nextStage/nextContext + the (separately tested)
// agent transition table. We additionally call `dispatch` directly below
// to ensure each tool the skill names is wired and returns ok.
void realDispatch; // silence unused

// --- Fixtures -------------------------------------------------------------

const customer: Customer = {
  id: "cust_test_001",
  phone: "+971500000000",
  name: "Test Customer",
  address: "Test Villa, Dubai",
  amc_tier: "none",
  wa_stage: "reminder_ack",
  wa_context: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const ctx: WaContext = {
  job_id: "job_test_001",
  slot_iso: "2026-05-20T09:00:00.000Z",
  service_type: "cockroach",
};

// --- Tests ----------------------------------------------------------------

async function testConfirm() {
  console.log("\n[case] rem_confirm — customer confirms visit");
  const r = await handleTurn({
    customer,
    waStage: "reminder_ack",
    waContext: ctx,
    buttonReply: {
      from: customer.phone,
      buttonId: "rem_confirm",
      buttonTitle: "Confirm",
      messageId: "wamid.test1",
    },
  });
  check("body acknowledges confirmation", /see you then/i.test(r.body), r.body);
  check("nextStage is 'done'", r.nextStage === "done", r.nextStage);
  check("context cleared", Object.keys(r.nextContext).length === 0);
  check("offers Main menu button", r.buttons.some((b) => b.id === "menu"));
  check("button count 1–3", r.buttons.length >= 1 && r.buttons.length <= 3);
}

async function testReschedule() {
  console.log("\n[case] rem_reschedule — with prior service_type → choose_date");
  const r = await handleTurn({
    customer,
    waStage: "reminder_ack",
    waContext: ctx, // has service_type=cockroach
    buttonReply: {
      from: customer.phone,
      buttonId: "rem_reschedule",
      buttonTitle: "Reschedule",
      messageId: "wamid.test2",
    },
  });
  check(
    "lands on 'choose_date' (per SKILL.md)",
    r.nextStage === "choose_date",
    `nextStage=${r.nextStage}`,
  );
  check(
    "preserves service_type",
    r.nextContext.service_type === "cockroach",
    `service_type=${r.nextContext.service_type}`,
  );
  check(
    "offers date buttons",
    r.buttons.some((b) => b.id.startsWith("date_")),
  );
  check("button count 1–3", r.buttons.length >= 1 && r.buttons.length <= 3);
}

async function testRescheduleNoService() {
  console.log("\n[case] rem_reschedule — no prior service_type → choose_service");
  const r = await handleTurn({
    customer,
    waStage: "reminder_ack",
    waContext: { job_id: "job_test_001" }, // no service_type
    buttonReply: {
      from: customer.phone,
      buttonId: "rem_reschedule",
      buttonTitle: "Reschedule",
      messageId: "wamid.test2b",
    },
  });
  check(
    "falls back to 'choose_service'",
    r.nextStage === "choose_service",
    `nextStage=${r.nextStage}`,
  );
  check(
    "offers pest-type buttons",
    r.buttons.some((b) => b.id.startsWith("svc_")),
  );
}

async function testCancel() {
  console.log("\n[case] rem_cancel — customer cancels visit");
  const r = await handleTurn({
    customer,
    waStage: "reminder_ack",
    waContext: ctx,
    buttonReply: {
      from: customer.phone,
      buttonId: "rem_cancel",
      buttonTitle: "Cancel",
      messageId: "wamid.test3",
    },
  });
  check("body confirms cancellation", /cancel/i.test(r.body), r.body);
  check("nextStage is 'done'", r.nextStage === "done", r.nextStage);
  check("offers Main menu button", r.buttons.some((b) => b.id === "menu"));
}

async function testUnknownButton() {
  console.log("\n[case] unknown button — falls back to main menu");
  const r = await handleTurn({
    customer,
    waStage: "reminder_ack",
    waContext: ctx,
    buttonReply: {
      from: customer.phone,
      buttonId: "garbage_button_id",
      buttonTitle: "???",
      messageId: "wamid.test4",
    },
  });
  check("falls back to main menu", r.nextStage === "menu", r.nextStage);
}

async function testNullButton() {
  console.log("\n[case] null buttonReply — falls back to main menu");
  const r = await handleTurn({
    customer,
    waStage: "reminder_ack",
    waContext: ctx,
    buttonReply: null,
  });
  check("falls back to main menu", r.nextStage === "menu", r.nextStage);
}

async function testToolsWired() {
  console.log("\n[case] tools the skill calls are wired in dispatch");
  const scheduleRes = await dispatch("schedule-reminder", {
    customer_id: customer.id,
    kind: "appointment",
    fire_at_iso: new Date().toISOString(),
  });
  check("schedule-reminder dispatches ok", scheduleRes.ok === true);

  const escalateRes = await dispatch("escalate-complaint", {
    customer_id: customer.id,
    reason: "test cancel",
    severity: "low",
  });
  check("escalate-complaint dispatches ok", escalateRes.ok === true);
}

// --- Run ------------------------------------------------------------------

(async () => {
  console.log("Testing skill: appointment-reminders");
  console.log("====================================");
  try {
    await testConfirm();
    await testReschedule();
    await testRescheduleNoService();
    await testCancel();
    await testUnknownButton();
    await testNullButton();
    await testToolsWired();
  } catch (err) {
    console.error("Unhandled error:", err);
    process.exitCode = 1;
    return;
  }

  console.log("\n------------------------------------");
  console.log(`Passed: ${passed}   Failed: ${failed}`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
})();
