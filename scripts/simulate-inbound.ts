// Simulate an inbound WhatsApp event by POSTing a signed, Meta-format webhook
// payload straight to a running server. Exercises the full pipeline:
// signature check → parse → rate-limit → Supabase → router → real WA reply.
//
// The server must be running (`npm run dev`). On success it sends a REAL
// WhatsApp reply to <customer-phone> — watch the phone.
//
// Usage:
//   npx tsx --env-file=.env scripts/simulate-inbound.ts <target-url> <phone> [buttonId]
//
//   # free-text first contact → expect the language picker
//   npx tsx --env-file=.env scripts/simulate-inbound.ts http://localhost:3000 919653411753
//
//   # button tap → expect the next screen
//   npx tsx --env-file=.env scripts/simulate-inbound.ts http://localhost:3000 919653411753 lang_en

import crypto from "node:crypto";

import { config } from "../src/config.js";

function buildPayload(
  from: string,
  buttonId: string | undefined,
): Record<string, unknown> {
  const messageId = `wamid.SIM${Date.now()}`;
  const message: Record<string, unknown> = buttonId
    ? {
        from,
        id: messageId,
        type: "interactive",
        interactive: {
          type: "button_reply",
          button_reply: { id: buttonId, title: buttonId },
        },
      }
    : {
        from,
        id: messageId,
        type: "text",
        text: { body: "hi" },
      };

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "SIMULATED_WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "0000000000",
                phone_number_id: config.WHATSAPP_PHONE_NUMBER_ID,
              },
              contacts: [{ profile: { name: "Simulated" }, wa_id: from }],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

function sign(rawBody: string, secret: string): string {
  return (
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
  );
}

async function main(): Promise<void> {
  const [targetUrl, rawPhone, buttonId] = process.argv.slice(2);
  if (!targetUrl || !rawPhone) {
    console.error(
      "Usage: tsx scripts/simulate-inbound.ts <target-url> <phone> [buttonId]",
    );
    console.error(
      "Example: tsx scripts/simulate-inbound.ts http://localhost:3000 919653411753 lang_en",
    );
    process.exit(2);
  }

  const from = rawPhone.replace(/[^0-9]/g, "");
  const webhookUrl = `${targetUrl.replace(/\/$/, "")}/webhook`;

  // The signature must cover the EXACT bytes that get POSTed.
  const rawBody = JSON.stringify(buildPayload(from, buttonId));
  const signature = sign(rawBody, config.WHATSAPP_APP_SECRET);

  console.log(`\nSimulating inbound → ${webhookUrl}`);
  console.log(`  customer : ${from}`);
  console.log(`  event    : ${buttonId ? `button tap "${buttonId}"` : 'free text "hi"'}`);
  console.log("");

  let res: Response;
  try {
    res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signature,
      },
      body: rawBody,
    });
  } catch (err) {
    console.error(
      "✗ Could not reach the server. Is `npm run dev` running?",
    );
    console.error("  ", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const text = await res.text();
  console.log(`HTTP ${res.status} ${res.statusText}`);
  console.log("Response:", text);
  console.log("");

  if (res.ok) {
    console.log(
      "✓ Server accepted the turn. Check the phone for the agent's reply.",
    );
    console.log(
      "  (If nothing arrives, the WhatsApp 24h window may be closed — send a",
    );
    console.log("   real 'hi' from the phone to the business number, then retry.)");
  } else {
    console.log("✗ Server rejected the request — see response above.");
    if (res.status === 400 || res.status === 403) {
      console.log(
        "  A 400/403 here usually means the signature check failed.",
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
