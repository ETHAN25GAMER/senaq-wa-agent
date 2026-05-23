// One-off harness that drives src/agent.ts handleTurn through the
// appointment-chatbot flow without touching WhatsApp, Supabase, or env.
// Run with:  npx tsx scripts/test-appointment-chatbot.ts

import { handleTurn } from "../src/agent.js";
import type {
  ButtonReply,
  Customer,
  WaContext,
  WaStage,
} from "../src/types.js";

const customer: Customer = {
  id: "cust_test_001",
  phone: "+971500000000",
  name: "Test Customer",
  address: "Test Address, Dubai",
  amc_tier: "none",
  wa_stage: "idle",
  wa_context: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const btn = (buttonId: string, buttonTitle = buttonId): ButtonReply => ({
  from: customer.phone,
  buttonId,
  buttonTitle,
  messageId: `wamid.${Math.random().toString(36).slice(2)}`,
});

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: unknown, label: string): void {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  }
}

function buttonIds(buttons: { id: string }[]): string[] {
  return buttons.map((b) => b.id);
}

async function step(
  label: string,
  stage: WaStage,
  ctx: WaContext,
  reply: ButtonReply | null,
) {
  console.log(`\n[${label}]  stage=${stage}  button=${reply?.buttonId ?? "<none>"}`);
  const r = await handleTurn({
    customer,
    waStage: stage,
    waContext: ctx,
    buttonReply: reply,
  });
  console.log(`  -> body: ${JSON.stringify(r.body)}`);
  console.log(`  -> buttons: ${JSON.stringify(r.buttons)}`);
  console.log(`  -> nextStage: ${r.nextStage}`);
  console.log(`  -> nextContext: ${JSON.stringify(r.nextContext)}`);
  return r;
}

async function main() {
  console.log("=== Appointment chatbot — happy path ===");

  // Cold start: customer is idle, no button -> should land on main menu
  let r = await step("idle entry", "idle", {}, null);
  assert(r.nextStage === "menu", "idle -> menu");
  assert(
    JSON.stringify(buttonIds(r.buttons)) ===
      JSON.stringify(["book_service", "amc_renewal", "other"]),
    "main menu has book_service / amc_renewal / other",
  );
  assert(r.buttons.length <= 3, "main menu respects 3-button cap");
  assert(r.body.length <= 1024, "main menu body <= 1024 chars");

  // Menu -> Book service -> choose_service
  r = await step("menu: book_service", "menu", r.nextContext, btn("book_service"));
  assert(r.nextStage === "choose_service", "book_service -> choose_service");
  assert(
    JSON.stringify(buttonIds(r.buttons)) ===
      JSON.stringify(["svc_cockroach", "svc_bed_bugs", "svc_general"]),
    "choose_service shows the 3 service buttons",
  );

  // choose_service: cockroach -> choose_date
  r = await step("choose_service: cockroach", "choose_service", r.nextContext, btn("svc_cockroach"));
  assert(r.nextStage === "choose_date", "svc_cockroach -> choose_date");
  assert(r.nextContext.service_type === "cockroach", "ctx.service_type stored as 'cockroach'");
  assert(
    JSON.stringify(buttonIds(r.buttons)) ===
      JSON.stringify(["date_today", "date_tomorrow", "date_day_after"]),
    "choose_date shows the 3 date buttons",
  );

  // choose_date: tomorrow -> choose_slot
  r = await step("choose_date: tomorrow", "choose_date", r.nextContext, btn("date_tomorrow"));
  assert(r.nextStage === "choose_slot", "date_tomorrow -> choose_slot");
  assert(typeof r.nextContext.date_iso === "string", "ctx.date_iso populated");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(r.nextContext.date_iso ?? ""), "date_iso is YYYY-MM-DD");
  assert(
    JSON.stringify(buttonIds(r.buttons)) ===
      JSON.stringify(["slot_morning", "slot_afternoon", "slot_evening"]),
    "choose_slot shows the 3 slot buttons",
  );

  // choose_slot: morning -> confirm_slot
  r = await step("choose_slot: morning", "choose_slot", r.nextContext, btn("slot_morning"));
  assert(r.nextStage === "confirm_slot", "slot_morning -> confirm_slot");
  assert(typeof r.nextContext.slot_iso === "string", "ctx.slot_iso populated");
  assert(
    (r.nextContext.slot_iso ?? "").endsWith("T09:00:00.000Z"),
    "morning slot is 09:00 UTC",
  );
  assert(
    JSON.stringify(buttonIds(r.buttons)) ===
      JSON.stringify(["confirm_yes", "confirm_change", "confirm_cancel"]),
    "confirm_slot shows confirm/change/cancel",
  );

  // confirm_slot: yes -> done (fires insert-job + schedule-reminder)
  r = await step("confirm_slot: yes", "confirm_slot", r.nextContext, btn("confirm_yes"));
  assert(r.nextStage === "done", "confirm_yes -> done");
  assert(/Booked/i.test(r.body), "confirmation body says 'Booked'");
  assert(
    JSON.stringify(buttonIds(r.buttons)) === JSON.stringify(["menu"]),
    "done state offers only Main menu",
  );

  // -----------------------------------------------------------------
  console.log("\n=== Appointment chatbot — edge cases ===");

  // confirm_change should bounce back to choose_date and keep service_type
  let ctxAtConfirm: WaContext = {
    service_type: "bed_bugs",
    date_iso: "2026-05-20",
    slot_iso: "2026-05-20T14:00:00.000Z",
  };
  r = await step("confirm_slot: change", "confirm_slot", ctxAtConfirm, btn("confirm_change"));
  assert(r.nextStage === "choose_date", "confirm_change -> choose_date");
  assert(r.nextContext.service_type === "bed_bugs", "service_type preserved through 'change time'");
  assert(r.nextContext.date_iso === undefined, "date_iso cleared on 'change time'");
  assert(r.nextContext.slot_iso === undefined, "slot_iso cleared on 'change time'");

  // confirm_cancel ends the flow
  r = await step("confirm_slot: cancel", "confirm_slot", ctxAtConfirm, btn("confirm_cancel"));
  assert(r.nextStage === "done", "confirm_cancel -> done");
  assert(/cancelled/i.test(r.body), "cancel body mentions cancelled");

  // Unknown button at choose_service -> falls back to main menu
  r = await step("choose_service: bogus button", "choose_service", {}, btn("svc_unknown"));
  assert(r.nextStage === "menu", "unknown service button -> main menu");

  // Customer sends "menu" from any stage -> reset to main menu
  r = await step("choose_slot: menu reset", "choose_slot", { service_type: "general", date_iso: "2026-05-20" }, btn("menu"));
  assert(r.nextStage === "menu", "'menu' button resets to main menu");
  assert(Object.keys(r.nextContext).length === 0, "menu reset clears context");

  // Afternoon and evening hour mapping
  r = await step("choose_slot: afternoon", "choose_slot", { service_type: "general", date_iso: "2026-05-20" }, btn("slot_afternoon"));
  assert((r.nextContext.slot_iso ?? "").endsWith("T14:00:00.000Z"), "afternoon slot is 14:00 UTC");
  r = await step("choose_slot: evening", "choose_slot", { service_type: "general", date_iso: "2026-05-20" }, btn("slot_evening"));
  assert((r.nextContext.slot_iso ?? "").endsWith("T18:00:00.000Z"), "evening slot is 18:00 UTC");

  // -----------------------------------------------------------------
  console.log("\n=== Summary ===");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Harness crashed:", e);
  process.exit(2);
});
