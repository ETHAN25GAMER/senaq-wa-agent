// Send a curated walkthrough of all 5 skills to a real WhatsApp number so you
// can see how each prompt + button set looks in the app.
//
// Run:   npx tsx --env-file=.env scripts/preview-on-whatsapp.ts +15555550100
//
// Constraint: WhatsApp Cloud API only allows free-form messages to numbers
// that have messaged the business in the last 24h. Open WhatsApp on the
// target number and send any message to the business number first.

import { sendButtons } from "../src/whatsapp/client.js";
import { t } from "../src/i18n/strings.js";
import type { OutboundButton } from "../src/types.js";

interface Preview {
  skill: string;
  body: string;
  buttons: OutboundButton[];
}

function bookingFlow(): Preview[] {
  return [
    {
      skill: "booking",
      body: t("menu_welcome"),
      buttons: [
        { id: "book_service", title: t("btn_book_service") },
        { id: "amc_renewal", title: t("btn_amc_renewal") },
        { id: "other", title: t("btn_other") },
      ],
    },
    {
      skill: "booking",
      body: t("choose_service_prompt"),
      buttons: [
        { id: "svc_cockroach", title: t("btn_svc_cockroach") },
        { id: "svc_bed_bugs", title: t("btn_svc_bed_bugs") },
        { id: "svc_general", title: t("btn_svc_general") },
      ],
    },
    {
      skill: "booking",
      body: t("choose_date_prompt"),
      buttons: [
        { id: "date_today", title: t("btn_date_today") },
        { id: "date_tomorrow", title: t("btn_date_tomorrow") },
        { id: "date_day_after", title: t("btn_date_day_after") },
      ],
    },
    {
      skill: "booking",
      body: t("choose_slot_prompt"),
      buttons: [
        { id: "slot_morning", title: t("btn_slot_morning") },
        { id: "slot_afternoon", title: t("btn_slot_afternoon") },
        { id: "slot_evening", title: t("btn_slot_evening") },
      ],
    },
    {
      skill: "booking",
      body: t("confirm_slot_prompt", {
        slot: t("confirm_slot_template", {
          date: "2026-05-20",
          label: t("slot_label_morning"),
          hour: "09",
        }),
      }),
      buttons: [
        { id: "confirm_yes", title: t("btn_confirm_yes") },
        { id: "confirm_change", title: t("btn_confirm_change") },
        { id: "confirm_cancel", title: t("btn_confirm_cancel") },
      ],
    },
    {
      skill: "booking",
      body: t("booked_ack"),
      buttons: [{ id: "menu", title: t("btn_main_menu") }],
    },
  ];
}

function reviewPrompt(): Preview {
  return {
    skill: "review",
    body: "How was your visit?",
    buttons: [
      { id: "rate_great", title: "Great" },
      { id: "rate_okay", title: "Okay" },
      { id: "rate_bad", title: "Bad" },
    ],
  };
}

function reminderAck(): Preview {
  return {
    skill: "reminders",
    body: "Reminder: your visit is tomorrow morning. Confirm?",
    buttons: [
      { id: "rem_confirm", title: "Confirm" },
      { id: "rem_reschedule", title: "Reschedule" },
      { id: "rem_cancel", title: "Cancel" },
    ],
  };
}

function awaitingPayment(): Preview {
  return {
    skill: "invoice",
    body: "Your invoice of $450 is due. How would you like to proceed?",
    buttons: [
      { id: "pay_now", title: "Pay now" },
      { id: "pay_later", title: "Pay later" },
      { id: "pay_dispute", title: "Dispute" },
    ],
  };
}

function followupNudge(): Preview {
  return {
    skill: "followup",
    body: t("fup_first_body"),
    buttons: [
      { id: "fup_continue", title: t("btn_fup_continue") },
      { id: "fup_restart", title: t("btn_fup_restart") },
      { id: "fup_no", title: t("btn_fup_no") },
    ],
  };
}

const ALL_PREVIEWS: Preview[] = [
  ...bookingFlow(),
  reviewPrompt(),
  reminderAck(),
  awaitingPayment(),
  followupNudge(),
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizePhone(raw: string): string {
  // Meta wants no leading + or spaces, just digits.
  return raw.replace(/[^0-9]/g, "");
}

async function main(): Promise<void> {
  const rawPhone = process.argv[2];
  if (!rawPhone) {
    console.error("Usage: tsx scripts/preview-on-whatsapp.ts <phone-number>");
    console.error("Example: tsx scripts/preview-on-whatsapp.ts +15555550100");
    process.exit(2);
  }
  const to = normalizePhone(rawPhone);
  if (to.length < 8) {
    console.error(`Phone number looks too short: ${rawPhone}`);
    process.exit(2);
  }

  const total = ALL_PREVIEWS.length;
  console.log(`\nSending ${total} preview messages to ${rawPhone} → ${to}\n`);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < ALL_PREVIEWS.length; i++) {
    const p = ALL_PREVIEWS[i]!;
    const num = `${i + 1}/${total}`;
    const labeledBody = `[${num} • ${p.skill}]\n\n${p.body}`;
    process.stdout.write(`${num.padStart(5)} • ${p.skill.padEnd(10)} — ${p.body.slice(0, 60).replace(/\n/g, " ")}… `);

    try {
      await sendButtons({ to, body: labeledBody, buttons: p.buttons });
      console.log("✓");
      sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`✗  ${msg.slice(0, 200)}`);
      failed++;
      // Stop on the first failure — usually means 24h window expired or
      // bad credentials; continuing just spams identical errors.
      if (msg.includes("131047") || msg.includes("re-engagement") || msg.includes("131051")) {
        console.error(
          "\n⚠  WhatsApp 24h re-engagement window has expired.",
        );
        console.error(
          "   Send any message from your phone to the business number, then re-run.",
        );
        break;
      }
      if (failed >= 3) {
        console.error("\nToo many failures — stopping early.");
        break;
      }
    }

    // Pace so the inbox doesn't get spammed; also stays well under any rate limits.
    if (i < ALL_PREVIEWS.length - 1) await sleep(2000);
  }

  console.log(
    `\nDone. ${sent} sent` + (failed ? `, ${failed} failed` : "") + ".",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
