import type { ToolName, ToolResult } from "../types.js";

import * as checkAvailability from "./check-availability.js";
import * as insertJob from "./insert-job.js";
import * as updateAmc from "./update-amc.js";
import * as generatePaymentLink from "./generate-payment-link.js";
import * as escalateComplaint from "./escalate-complaint.js";
import * as scheduleReminder from "./schedule-reminder.js";
import * as sendReviewLink from "./send-review-link.js";

export async function dispatch(
  name: ToolName,
  input: unknown,
): Promise<ToolResult> {
  switch (name) {
    case "check-availability":
      return checkAvailability.handler(input as checkAvailability.CheckAvailabilityInput);
    case "insert-job":
      return insertJob.handler(input as insertJob.InsertJobInput);
    case "update-amc":
      return updateAmc.handler(input as updateAmc.UpdateAmcInput);
    case "generate-payment-link":
      return generatePaymentLink.handler(input as generatePaymentLink.GeneratePaymentLinkInput);
    case "escalate-complaint":
      return escalateComplaint.handler(input as escalateComplaint.EscalateComplaintInput);
    case "schedule-reminder":
      return scheduleReminder.handler(input as scheduleReminder.ScheduleReminderInput);
    case "send-review-link":
      return sendReviewLink.handler(input as sendReviewLink.SendReviewLinkInput);
    default: {
      const _exhaustive: never = name;
      return { ok: false, error: `unknown tool: ${String(_exhaustive)}` };
    }
  }
}
