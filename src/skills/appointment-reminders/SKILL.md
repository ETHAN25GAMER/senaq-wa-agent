---
name: appointment-reminders
description: 24h-before appointment reminder, with reschedule/cancel buttons.
---

# Appointment Reminders

Fires from a scheduled reminder row. The customer's `wa_stage` is set to
`reminder_ack` when the outbound message is delivered.

## Hard rules

- Buttons only.
- Reschedule routes the customer back into the appointment chatbot at
  `choose_date`.
- Cancel must call `update-amc` only if the cancelled job was AMC-covered;
  otherwise just close the job (no AMC change).

## Stage map

| `wa_stage`        | Buttons                              | Tool to call after reply         |
| ----------------- | ------------------------------------ | -------------------------------- |
| `reminder_ack`    | Confirm, Reschedule, Cancel          | branch                           |
| (after Cancel)    | (returns to `menu`)                  | `escalate-complaint` if repeated |
