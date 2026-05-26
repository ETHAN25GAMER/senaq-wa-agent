// Standalone test for the invoice-reminders skill.
// Run: npx tsx src/skills/invoice-reminders/test.ts
//
// Drives `handleTurn` through the awaiting_payment + payment_defer stages
// using each button the skill defines, asserting body / buttons / nextStage
// and that the tools the skill names are wired in dispatch.

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

// --- Fixtures -------------------------------------------------------------

const customer: Customer = {
  id: "cust_test_inv_001",
  phone: "+15555550101",
  name: "Test Invoice Customer",
  address: "123 Test Street",
  amc_tier: "none",
  wa_stage: "awaiting_payment",
  wa_context: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const ctx: WaContext = {
  invoice_id: "inv_test_001",
  invoice_amount: 350,
};

// --- Tests ----------------------------------------------------------------

async function testPayNow() {
  console.log("\n[case] pay_now — customer pays now");
  const r = await handleTurn({
    customer,
    waStage: "awaiting_payment",
    waContext: ctx,
    buttonReply: {
      from: customer.phone,
      buttonId: "pay_now",
      buttonTitle: "Pay now",
      messageId: "wamid.inv1",
    },
  });
  check(
    "body points customer to follow-up link",
    /link/i.test(r.body) && /follow-?up|payment/i.test(r.body),
    r.body,
  );
  check("nextStage is 'done'", r.nextStage === "done", r.nextStage);
  check("context cleared", Object.keys(r.nextContext).length === 0);
  check("offers Main menu button", r.buttons.some((b) => b.id === "menu"));
  check("button count 1–3", r.buttons.length >= 1 && r.buttons.length <= 3);
  check(
    "body does NOT pre-embed amount (skill rule)",
    !/\b350\b/.test(r.body) && !/\$/.test(r.body),
    r.body,
  );
}

async function testPayLater() {
  console.log("\n[case] pay_later — customer defers");
  const r = await handleTurn({
    customer,
    waStage: "awaiting_payment",
    waContext: ctx,
    buttonReply: {
      from: customer.phone,
      buttonId: "pay_later",
      buttonTitle: "Pay later",
      messageId: "wamid.inv2",
    },
  });
  check("body asks when to remind", /remind/i.test(r.body), r.body);
  check(
    "nextStage is 'payment_defer'",
    r.nextStage === "payment_defer",
    r.nextStage,
  );
  check(
    "context preserved for follow-up",
    r.nextContext.invoice_id === ctx.invoice_id,
  );
  check("button count 1–3", r.buttons.length >= 1 && r.buttons.length <= 3);
  check(
    "offers Tomorrow button",
    r.buttons.some((b) => b.id === "defer_tomorrow"),
  );
  check(
    "offers Next week button",
    r.buttons.some((b) => b.id === "defer_next_week"),
  );
}

async function testDispute() {
  console.log("\n[case] pay_dispute — customer disputes invoice");
  const r = await handleTurn({
    customer,
    waStage: "awaiting_payment",
    waContext: ctx,
    buttonReply: {
      from: customer.phone,
      buttonId: "pay_dispute",
      buttonTitle: "Dispute",
      messageId: "wamid.inv3",
    },
  });
  check(
    "body acknowledges dispute escalation",
    /accounts|team|flag/i.test(r.body),
    r.body,
  );
  check(
    "nextStage is 'escalated'",
    r.nextStage === "escalated",
    r.nextStage,
  );
  check("context cleared", Object.keys(r.nextContext).length === 0);
  check("offers Main menu button", r.buttons.some((b) => b.id === "menu"));
}

async function testDeferTomorrow() {
  console.log("\n[case] defer_tomorrow — customer wants tomorrow reminder");
  const r = await handleTurn({
    customer,
    waStage: "payment_defer",
    waContext: ctx,
    buttonReply: {
      from: customer.phone,
      buttonId: "defer_tomorrow",
      buttonTitle: "Tomorrow",
      messageId: "wamid.inv4",
    },
  });
  check(
    "body acknowledges tomorrow reminder",
    /day|tomorrow/i.test(r.body),
    r.body,
  );
  check("nextStage is 'done'", r.nextStage === "done", r.nextStage);
  check("offers Main menu button", r.buttons.some((b) => b.id === "menu"));
}

async function testDeferNextWeek() {
  console.log("\n[case] defer_next_week — customer wants next-week reminder");
  const r = await handleTurn({
    customer,
    waStage: "payment_defer",
    waContext: ctx,
    buttonReply: {
      from: customer.phone,
      buttonId: "defer_next_week",
      buttonTitle: "Next week",
      messageId: "wamid.inv5",
    },
  });
  check(
    "body acknowledges week reminder",
    /week/i.test(r.body),
    r.body,
  );
  check("nextStage is 'done'", r.nextStage === "done", r.nextStage);
  check("offers Main menu button", r.buttons.some((b) => b.id === "menu"));
}

async function testUnknownButtonAwaiting() {
  console.log("\n[case] unknown button on awaiting_payment — fallback to menu");
  const r = await handleTurn({
    customer,
    waStage: "awaiting_payment",
    waContext: ctx,
    buttonReply: {
      from: customer.phone,
      buttonId: "garbage_button_id",
      buttonTitle: "???",
      messageId: "wamid.inv6",
    },
  });
  check("falls back to main menu", r.nextStage === "menu", r.nextStage);
}

async function testNullButton() {
  console.log("\n[case] null buttonReply — falls back to main menu");
  const r = await handleTurn({
    customer,
    waStage: "awaiting_payment",
    waContext: ctx,
    buttonReply: null,
  });
  check("falls back to main menu", r.nextStage === "menu", r.nextStage);
}

async function testToolsWired() {
  console.log("\n[case] tools the skill calls are wired in dispatch");
  const payRes = await dispatch("generate-payment-link", {
    invoice_id: ctx.invoice_id!,
    amount: ctx.invoice_amount!,
  });
  check("generate-payment-link dispatches ok", payRes.ok === true);
  check(
    "generate-payment-link returns a url in data",
    typeof (payRes.data as { url?: unknown } | undefined)?.url === "string",
  );

  const escalateRes = await dispatch("escalate-complaint", {
    customer_id: customer.id,
    reason: "test dispute",
    severity: "medium",
  });
  check("escalate-complaint dispatches ok", escalateRes.ok === true);

  const scheduleRes = await dispatch("schedule-reminder", {
    customer_id: customer.id,
    kind: "invoice",
    fire_at_iso: new Date().toISOString(),
  });
  check("schedule-reminder dispatches ok", scheduleRes.ok === true);
}

// --- Run ------------------------------------------------------------------

(async () => {
  console.log("Testing skill: invoice-reminders");
  console.log("================================");
  try {
    await testPayNow();
    await testPayLater();
    await testDispute();
    await testDeferTomorrow();
    await testDeferNextWeek();
    await testUnknownButtonAwaiting();
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
