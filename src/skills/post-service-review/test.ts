// Standalone test for the post-service-review skill.
// Run: npx tsx src/skills/post-service-review/test.ts
//
// Drives `handleTurn` through the review_pending / review_positive /
// review_negative stages using each button the skill defines, asserting
// body / buttons / nextStage / nextContext and that the tools the skill
// names (send-review-link, escalate-complaint) are wired in dispatch.

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
  id: "cust_test_rev_001",
  phone: "+971500000002",
  name: "Test Review Customer",
  address: "Test Villa, Dubai",
  amc_tier: "none",
  wa_stage: "review_pending",
  wa_context: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const ctx: WaContext = {
  job_id: "job_test_rev_001",
};

// --- Tests ----------------------------------------------------------------

async function testRateGreat() {
  console.log("\n[case] rate_great — customer rates the visit great");
  const r = await handleTurn({
    customer,
    waStage: "review_pending",
    waContext: ctx,
    buttonReply: {
      from: customer.phone,
      buttonId: "rate_great",
      buttonTitle: "Great",
      messageId: "wamid.rev1",
    },
  });
  check(
    "body asks for a Google review",
    /review/i.test(r.body),
    r.body,
  );
  check(
    "nextStage is 'review_positive'",
    r.nextStage === "review_positive",
    r.nextStage,
  );
  check(
    "context preserved (job_id carried into positive branch)",
    r.nextContext.job_id === ctx.job_id,
  );
  check("button count 1–3", r.buttons.length >= 1 && r.buttons.length <= 3);
  check(
    "offers 'Leave a review' button",
    r.buttons.some((b) => b.id === "review_yes"),
  );
  check(
    "offers 'Maybe later' button",
    r.buttons.some((b) => b.id === "review_later"),
  );
}

async function testRateOkay() {
  console.log("\n[case] rate_okay — customer rates the visit okay");
  const r = await handleTurn({
    customer,
    waStage: "review_pending",
    waContext: ctx,
    buttonReply: {
      from: customer.phone,
      buttonId: "rate_okay",
      buttonTitle: "Okay",
      messageId: "wamid.rev2",
    },
  });
  check(
    "body offers manager callback",
    /manager|sorry|call/i.test(r.body),
    r.body,
  );
  check(
    "nextStage is 'review_negative'",
    r.nextStage === "review_negative",
    r.nextStage,
  );
  check("button count 1–3", r.buttons.length >= 1 && r.buttons.length <= 3);
  check(
    "offers 'Talk to manager' button",
    r.buttons.some((b) => b.id === "complaint_yes"),
  );
  check(
    "offers 'No thanks' button",
    r.buttons.some((b) => b.id === "complaint_no"),
  );
  check(
    "body does NOT contain a Google review link (skill rule)",
    !/google\.com\/maps|g\.page|search\.google/i.test(r.body),
    r.body,
  );
}

async function testRateBad() {
  console.log("\n[case] rate_bad — customer rates the visit bad");
  const r = await handleTurn({
    customer,
    waStage: "review_pending",
    waContext: ctx,
    buttonReply: {
      from: customer.phone,
      buttonId: "rate_bad",
      buttonTitle: "Bad",
      messageId: "wamid.rev3",
    },
  });
  check(
    "nextStage is 'review_negative'",
    r.nextStage === "review_negative",
    r.nextStage,
  );
  check(
    "offers 'Talk to manager' button",
    r.buttons.some((b) => b.id === "complaint_yes"),
  );
  check(
    "body does NOT contain a Google review link (skill rule)",
    !/google\.com\/maps|g\.page|search\.google/i.test(r.body),
    r.body,
  );
}

async function testReviewYes() {
  console.log("\n[case] review_yes — customer agrees to leave a review");
  const r = await handleTurn({
    customer,
    waStage: "review_positive",
    waContext: ctx,
    buttonReply: {
      from: customer.phone,
      buttonId: "review_yes",
      buttonTitle: "Leave a review",
      messageId: "wamid.rev4",
    },
  });
  check(
    "body thanks customer and references the review link",
    /thank|review|link/i.test(r.body),
    r.body,
  );
  check("nextStage is 'done'", r.nextStage === "done", r.nextStage);
  check("context cleared", Object.keys(r.nextContext).length === 0);
  check("offers Main menu button", r.buttons.some((b) => b.id === "menu"));
  check("button count 1–3", r.buttons.length >= 1 && r.buttons.length <= 3);
}

async function testReviewLater() {
  console.log("\n[case] review_later — customer declines to leave a review now");
  const r = await handleTurn({
    customer,
    waStage: "review_positive",
    waContext: ctx,
    buttonReply: {
      from: customer.phone,
      buttonId: "review_later",
      buttonTitle: "Maybe later",
      messageId: "wamid.rev5",
    },
  });
  check("nextStage is 'done'", r.nextStage === "done", r.nextStage);
  check("context cleared", Object.keys(r.nextContext).length === 0);
  check("offers Main menu button", r.buttons.some((b) => b.id === "menu"));
  check(
    "body does NOT contain a Google review link (only sent on review_yes)",
    !/google\.com\/maps|g\.page|search\.google/i.test(r.body),
    r.body,
  );
}

async function testComplaintYes() {
  console.log("\n[case] complaint_yes — customer wants the manager to call");
  const r = await handleTurn({
    customer,
    waStage: "review_negative",
    waContext: ctx,
    buttonReply: {
      from: customer.phone,
      buttonId: "complaint_yes",
      buttonTitle: "Talk to manager",
      messageId: "wamid.rev6",
    },
  });
  check(
    "body acknowledges manager will call",
    /manager|call|sorry|trouble/i.test(r.body),
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

async function testComplaintNo() {
  console.log("\n[case] complaint_no — customer declines manager callback");
  const r = await handleTurn({
    customer,
    waStage: "review_negative",
    waContext: ctx,
    buttonReply: {
      from: customer.phone,
      buttonId: "complaint_no",
      buttonTitle: "No thanks",
      messageId: "wamid.rev7",
    },
  });
  check(
    "body acknowledges feedback",
    /thank|feedback/i.test(r.body),
    r.body,
  );
  check("nextStage is 'done'", r.nextStage === "done", r.nextStage);
  check("offers Main menu button", r.buttons.some((b) => b.id === "menu"));
}

async function testUnknownButtonPending() {
  console.log("\n[case] unknown button on review_pending — fallback to menu");
  const r = await handleTurn({
    customer,
    waStage: "review_pending",
    waContext: ctx,
    buttonReply: {
      from: customer.phone,
      buttonId: "garbage_button_id",
      buttonTitle: "???",
      messageId: "wamid.rev8",
    },
  });
  check("falls back to main menu", r.nextStage === "menu", r.nextStage);
}

async function testNullButton() {
  console.log("\n[case] null buttonReply on review_pending — fallback to menu");
  const r = await handleTurn({
    customer,
    waStage: "review_pending",
    waContext: ctx,
    buttonReply: null,
  });
  check("falls back to main menu", r.nextStage === "menu", r.nextStage);
}

async function testButtonCountCap() {
  console.log("\n[case] every review stage stays within the 3-button cap");
  const stages: Array<{
    stage: "review_pending" | "review_positive" | "review_negative";
    buttonId: string;
  }> = [
    { stage: "review_pending", buttonId: "rate_great" },
    { stage: "review_pending", buttonId: "rate_okay" },
    { stage: "review_pending", buttonId: "rate_bad" },
    { stage: "review_positive", buttonId: "review_yes" },
    { stage: "review_positive", buttonId: "review_later" },
    { stage: "review_negative", buttonId: "complaint_yes" },
    { stage: "review_negative", buttonId: "complaint_no" },
  ];
  for (const s of stages) {
    const r = await handleTurn({
      customer,
      waStage: s.stage,
      waContext: ctx,
      buttonReply: {
        from: customer.phone,
        buttonId: s.buttonId,
        buttonTitle: s.buttonId,
        messageId: `wamid.cap.${s.buttonId}`,
      },
    });
    check(
      `${s.stage}+${s.buttonId}: 1–3 buttons`,
      r.buttons.length >= 1 && r.buttons.length <= 3,
      `got ${r.buttons.length}`,
    );
    check(
      `${s.stage}+${s.buttonId}: body <= 1024 chars`,
      r.body.length <= 1024,
      `len=${r.body.length}`,
    );
  }
}

async function testToolsWired() {
  console.log("\n[case] tools the skill calls are wired in dispatch");
  const reviewRes = await dispatch("send-review-link", {
    customer_id: customer.id,
    job_id: ctx.job_id!,
  });
  check("send-review-link dispatches ok", reviewRes.ok === true);

  // Skill rule: negative rating must escalate with severity="high".
  const escalateRes = await dispatch("escalate-complaint", {
    customer_id: customer.id,
    reason: "Negative post-service rating",
    severity: "high",
  });
  check("escalate-complaint (severity=high) dispatches ok", escalateRes.ok === true);
}

// --- Run ------------------------------------------------------------------

(async () => {
  console.log("Testing skill: post-service-review");
  console.log("==================================");
  try {
    await testRateGreat();
    await testRateOkay();
    await testRateBad();
    await testReviewYes();
    await testReviewLater();
    await testComplaintYes();
    await testComplaintNo();
    await testUnknownButtonPending();
    await testNullButton();
    await testButtonCountCap();
    await testToolsWired();
  } catch (err) {
    console.error("Unhandled error:", err);
    process.exitCode = 1;
    return;
  }

  console.log("\n----------------------------------");
  console.log(`Passed: ${passed}   Failed: ${failed}`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
})();
