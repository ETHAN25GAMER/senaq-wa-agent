---
name: follow-up-nudge
description: Re-engage customers who go quiet mid-conversation; eventually close or escalate dead chats.
---

# Follow-up Nudge

System-triggered (not a customer button). A cron job runs every 15 min, queries
Supabase for stuck conversations, and either nudges the customer or escalates.

## Hard rules

- Buttons only. The nudge offers exactly 3 options.
- We never nudge more than twice. After the 2nd nudge goes unanswered for 24h,
  the conversation is escalated and closed.
- A `wa_stage` of `idle`, `done`, or `escalated` is never nudged.
- The customer's previous `wa_stage` is preserved in `wa_context.prev_stage`
  so "Continue" can resume them exactly where they left off.

## Policy

| Idle duration                    | Action                                              |
| -------------------------------- | --------------------------------------------------- |
| ≥ 30 min since last interaction  | Send 1st nudge → `wa_stage = followup_pending`     |
| ≥ 2 h since 1st nudge sent       | Send 2nd nudge (same buttons, more urgent body)    |
| ≥ 24 h since 2nd nudge sent      | `escalate-complaint` (severity=low) + `escalated`  |

## Stage map

| `wa_stage`         | Buttons                                  | Tool to call after reply       |
| ------------------ | ---------------------------------------- | ------------------------------ |
| `followup_pending` | Continue, Start over, No thanks          | branch                         |
| (Continue)         | restores `prev_stage`, re-shows prompt   | —                              |
| (Start over)       | returns to `menu`                        | —                              |
| (No thanks)        | terminal `done`                          | —                              |

## Context fields used

- `prev_stage` — the stage the customer was on before going idle.
- `last_prompt` — `{ body, buttons }` snapshot of the last outbound message,
  re-sent verbatim when the customer hits Continue.
- `followup1_sent_at` / `followup2_sent_at` — ISO timestamps used by the cron
  query to bucket customers into 1st-nudge / 2nd-nudge / escalation.
