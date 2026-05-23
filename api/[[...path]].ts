// Vercel serverless entry point.
//
// Vercel auto-discovers files under `api/`. This catch-all forwards every
// path to the Hono app — same routes work locally (`npm run dev`) and on
// Vercel without duplication.

import { handle } from "@hono/node-server/vercel";

import { app } from "../src/app.js";

export const config = {
  runtime: "nodejs",
};

export default handle(app);
