---
name: invoice-reminders
description: Nudge customers with outstanding invoices and collect payment.
---

# Invoice Reminders

Fires when an invoice crosses its due date.

## Hard rules

- Buttons only.
- The payment link is generated on demand via `generate-payment-link` — never
  pre-embed amounts in the prompt.
- Disputes route to `escalate-complaint` with `severity: "medium"`.

## Stage map

| `wa_stage`           | Buttons                                  | Tool to call after reply      |
| -------------------- | ---------------------------------------- | ----------------------------- |
| `awaiting_payment`   | Pay now, Pay later, Dispute              | branch                        |
| (after Pay now)      | (sends a button with payment URL)        | `generate-payment-link`       |
| (after Pay later)    | Tomorrow, Next week                      | `schedule-reminder`           |
| (after Dispute)      | (closes flow, escalates)                 | `escalate-complaint`          |
