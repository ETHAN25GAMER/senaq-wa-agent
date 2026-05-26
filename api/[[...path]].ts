// Vercel serverless entry point.
//
// Vercel auto-discovers files under `api/`. Public URLs like `/webhook` and
// `/cron/followup` are rewritten by vercel.json to `/api/<path>`, which Vercel
// routes here. We mount the Hono app at the `/api` prefix so the rewritten
// paths line up with the routes the app defines at the root (e.g. `/webhook`).
//
// Local dev (src/index.ts) is unaffected — it serves the app at the root.

import { handle } from "@hono/node-server/vercel";
import { Hono } from "hono";

import { app } from "../src/app.js";

export const config = {
  runtime: "nodejs",
};

const wrapper = new Hono();
wrapper.route("/api", app);

export default handle(wrapper);
