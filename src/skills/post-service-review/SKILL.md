---
name: post-service-review
description: Collect a star rating after a job, send a review link if happy.
---

# Post-Service Review

Triggered after a job is marked complete.

## Hard rules

- Buttons only. Never request free-text reviews on WhatsApp.
- The Google review link is sent via `send-review-link` only after a positive rating.
- A negative rating must call `escalate-complaint` with `severity: "high"`.

## Stage map

| `wa_stage`          | Buttons                              | Tool to call after reply       |
| ------------------- | ------------------------------------ | ------------------------------ |
| `review_pending`    | Great, Okay, Bad                     | branch on rating               |
| (after Great)       | Leave a review, Maybe later          | `send-review-link`             |
| (after Okay/Bad)    | Talk to manager, No thanks           | `escalate-complaint`           |
