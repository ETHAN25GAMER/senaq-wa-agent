// Local-development entry point.
// On Vercel, api/[[...path]].ts is the entry point instead — this file is unused.

import { serve } from "@hono/node-server";

import { app } from "./app.js";
import { config } from "./config.js";
import { log } from "./utils/logger.js";

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  log.info("server_started", { port: info.port });
});
