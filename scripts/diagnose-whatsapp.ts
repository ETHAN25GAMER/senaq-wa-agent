// Diagnostic: send one plain text message and print Meta's full response so
// we can see what's actually happening (delivery vs silent drop).
//
// Run:  npx tsx --env-file=.env scripts/diagnose-whatsapp.ts +919653411753

import { config } from "../src/config.js";

async function main(): Promise<void> {
  const rawPhone = process.argv[2];
  if (!rawPhone) {
    console.error("Usage: tsx scripts/diagnose-whatsapp.ts <phone-number>");
    process.exit(2);
  }
  const to = rawPhone.replace(/[^0-9]/g, "");

  console.log("Config in use:");
  console.log("  WHATSAPP_PHONE_NUMBER_ID =", config.WHATSAPP_PHONE_NUMBER_ID);
  console.log("  WHATSAPP_TOKEN (first 12)=", config.WHATSAPP_TOKEN.slice(0, 12) + "…");
  console.log("  Target                   =", to);
  console.log("");

  const url = `https://graph.facebook.com/v21.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: {
      body: "🔧 SENAQ diagnostic — plain text test message. If you see this, delivery works.",
    },
  };

  console.log("POST", url);
  console.log("Payload:", JSON.stringify(payload, null, 2));
  console.log("");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await res.text();
  console.log("HTTP status:", res.status, res.statusText);
  console.log("Response body:", body);
  console.log("");

  try {
    const json = JSON.parse(body);
    if (json.messages?.[0]?.id) {
      console.log("✓ Meta accepted the message. ID:", json.messages[0].id);
      console.log("");
      console.log(
        "If you DON'T see the message on the phone, it's almost certainly one of:",
      );
      console.log(
        "  1) The phone number isn't in Meta's 'To' tester list for this app",
      );
      console.log(
        "     (Meta for Developers → your app → WhatsApp → API Setup → 'To')",
      );
      console.log(
        "  2) Your business hasn't been verified for production, AND the 24h",
      );
      console.log(
        "     re-engagement window isn't open (you never messaged the BUSINESS",
      );
      console.log(
        "     number tied to phone_number_id=" + config.WHATSAPP_PHONE_NUMBER_ID + ")",
      );
    }
    if (json.error) {
      console.log("✗ Meta returned an error:");
      console.log("   code:", json.error.code);
      console.log("   message:", json.error.message);
      console.log("   subcode:", json.error.error_subcode);
      console.log("   details:", json.error.error_data?.details);
    }
  } catch {
    // body wasn't JSON
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
