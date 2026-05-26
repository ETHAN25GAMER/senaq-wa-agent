// Writes dashboard/config.js from environment variables at deploy time.
// Used by vercel.json's `buildCommand`. Plain Node, no deps.
//
// Required env vars (set in Vercel → Project → Settings → Environment Variables):
//   SUPABASE_URL          – project URL (e.g. https://abcd.supabase.co)
//   SUPABASE_ANON_KEY     – anon / public key
//
// Locally you don't need this — write dashboard/config.js by hand.

import { writeFileSync } from "node:fs";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  console.error("[build-config] Missing SUPABASE_URL or SUPABASE_ANON_KEY env var.");
  console.error("[build-config] Set them in Vercel → Project → Settings → Environment Variables.");
  process.exit(1);
}

function jwtPayload(jwt) {
  try {
    const seg = jwt.split(".")[1];
    if (!seg) return null;
    const b64 = seg.replace(/-/g, "+").replace(/_/g, "/")
      .padEnd(seg.length + (4 - seg.length % 4) % 4, "=");
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch { return null; }
}
const payload = jwtPayload(KEY);
if (payload?.role && payload.role !== "anon") {
  console.error(`[build-config] SUPABASE_ANON_KEY has role="${payload.role}". Expected "anon". Refusing to write.`);
  process.exit(1);
}

const out = `// Generated at build time from Vercel env vars. Do not edit.
window.__SENAQ_CONFIG__ = {
  SUPABASE_URL:      ${JSON.stringify(URL)},
  SUPABASE_ANON_KEY: ${JSON.stringify(KEY)},
};
`;

writeFileSync("config.js", out);
console.log(`[build-config] Wrote config.js → ${URL}`);
