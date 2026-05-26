import type { ButtonReply } from "../types.js";

export type ParseResult =
  | { kind: "button"; reply: ButtonReply; profileName: string | null }
  | { kind: "non_button"; from: string; messageId: string; profileName: string | null }
  | { kind: "ignore" };

export function parseInbound(payload: unknown): ParseResult {
  const entry = (payload as any)?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const message = value?.messages?.[0];
  if (!message) return { kind: "ignore" };

  const from: string | undefined = message.from;
  const messageId: string | undefined = message.id;
  if (!from || !messageId) return { kind: "ignore" };

  // Meta puts the WhatsApp display name on the matching contact entry.
  const contact = (value?.contacts ?? []).find(
    (c: { wa_id?: string }) => c?.wa_id === from,
  );
  const rawName = contact?.profile?.name;
  const profileName: string | null =
    typeof rawName === "string" && rawName.trim() ? rawName.trim() : null;

  if (message.type === "interactive") {
    const br = message.interactive?.button_reply;
    if (br?.id) {
      return {
        kind: "button",
        profileName,
        reply: {
          from,
          buttonId: br.id,
          buttonTitle: br.title ?? "",
          messageId,
        },
      };
    }
  }

  // Anything else (text, image, location, ...) is treated as non-button.
  // Webhook should reply with a fallback button menu — never accept free text.
  return { kind: "non_button", from, messageId, profileName };
}
