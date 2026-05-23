import crypto from "node:crypto";

export function verifySignature(
  rawBody: string,
  headerSig: string | undefined,
  appSecret: string,
): boolean {
  if (!headerSig) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(headerSig);
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

export interface HandshakeQuery {
  mode: string | undefined;
  token: string | undefined;
  challenge: string | undefined;
}

export function verifyHandshake(
  q: HandshakeQuery,
  verifyToken: string,
): string | null {
  if (q.mode === "subscribe" && q.token === verifyToken && q.challenge) {
    return q.challenge;
  }
  return null;
}
