import { config } from "../config.js";
import type { OutboundButton } from "../types.js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

interface SendButtonsArgs {
  to: string;
  body: string;
  buttons: OutboundButton[];
}

export async function sendButtons({
  to,
  body,
  buttons,
}: SendButtonsArgs): Promise<void> {
  if (buttons.length === 0 || buttons.length > 3) {
    throw new Error(
      `WhatsApp interactive buttons must be 1–3 (got ${buttons.length}).`,
    );
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  };

  await postGraph(payload);
}

export async function sendText(to: string, body: string): Promise<void> {
  // Use sparingly — customer-facing surface should be button-only.
  await postGraph({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body },
  });
}

async function postGraph(payload: unknown): Promise<void> {
  const url = `${GRAPH_BASE}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${text}`);
  }
}
