import type { Context } from "hono";
import { log } from "./logger.js";

export class ValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class RateLimitError extends Error {
  readonly status = 429;
  constructor(
    message: string,
    readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class UpstreamError extends Error {
  readonly status = 502;
  constructor(message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

export class UnknownError extends Error {
  readonly status = 500;
  constructor(message: string) {
    super(message);
    this.name = "UnknownError";
  }
}

type HonoHandler = (c: Context) => Promise<Response> | Response;

export function withErrorHandling(handler: HonoHandler): HonoHandler {
  return async (c) => {
    try {
      return await handler(c);
    } catch (err) {
      return classify(c, err);
    }
  };
}

function classify(c: Context, err: unknown): Response {
  if (err instanceof ValidationError) {
    log.warn("validation_error", { msg: err.message });
    return c.json({ error: "validation_error", message: err.message }, 400);
  }
  if (err instanceof RateLimitError) {
    log.warn("rate_limited", { retryAfterMs: err.retryAfterMs });
    c.header("Retry-After", String(Math.ceil(err.retryAfterMs / 1000)));
    return c.json({ error: "rate_limited" }, 429);
  }
  if (err instanceof UpstreamError) {
    log.error("upstream_error", { msg: err.message });
    return c.json({ error: "upstream_error" }, 502);
  }

  const message = err instanceof Error ? err.message : String(err);
  log.error("unknown_error", { msg: message });
  return c.json({ error: "internal_error" }, 500);
}
