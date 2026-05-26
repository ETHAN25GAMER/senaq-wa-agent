// Translation table for every customer-facing string.
//
// English-only. `t(key, params?)` does parameter interpolation but no language
// dispatch — the lookup is a flat object.

export type StringKey =
  // main menu
  | "menu_welcome"
  | "btn_book_service"
  | "btn_amc_renewal"
  | "btn_other"
  | "btn_main_menu"
  // booking
  | "choose_service_prompt"
  | "btn_svc_cockroach"
  | "btn_svc_bed_bugs"
  | "btn_svc_general"
  | "amc_logged"
  | "escalate_ack"
  | "choose_date_prompt"
  | "btn_date_today"
  | "btn_date_tomorrow"
  | "btn_date_day_after"
  | "choose_slot_prompt"
  | "btn_slot_morning"
  | "btn_slot_afternoon"
  | "btn_slot_evening"
  | "confirm_slot_prompt" // {slot}
  | "btn_confirm_yes"
  | "btn_confirm_change"
  | "btn_confirm_cancel"
  | "booked_ack"
  | "booking_needs_address"
  | "change_time_prompt"
  | "booking_cancelled"
  // review
  | "review_great"
  | "btn_review_yes"
  | "btn_review_later"
  | "review_bad"
  | "btn_complaint_yes"
  | "btn_complaint_no"
  | "review_sent_thanks"
  | "review_later_ack"
  | "manager_will_call"
  | "feedback_thanks"
  // reminder
  | "reminder_confirmed"
  | "reschedule_prompt"
  | "visit_cancelled"
  // invoice
  | "pay_link_sent"
  | "pay_link_body" // {url} {amt}  — text follow-up with the real URL
  | "review_link_body" // {url}      — text follow-up with the review URL
  | "pay_defer_prompt"
  | "btn_defer_tomorrow"
  | "btn_defer_next_week"
  | "dispute_flagged"
  | "pay_defer_ack" // {duration}
  | "duration_a_day"
  | "duration_a_week"
  // follow-up nudge
  | "btn_fup_continue"
  | "btn_fup_restart"
  | "btn_fup_no"
  | "fup_no_ack"
  | "fup_first_body"
  | "fup_second_body"
  // app.ts fallback
  | "fallback_prompt"
  | "btn_talk_human"
  // slot rendering
  | "slot_label_morning"
  | "slot_label_afternoon"
  | "slot_label_evening"
  | "confirm_slot_template"; // {date} {label} ({hour}:00)

const STRINGS: Record<StringKey, string> = {
  menu_welcome: "Welcome to SENAQ Pest Control 🐜 — how can we help?",
  btn_book_service: "Book service",
  btn_amc_renewal: "AMC renewal",
  btn_other: "Other",
  btn_main_menu: "Main menu",

  choose_service_prompt: "Which pest are we treating?",
  btn_svc_cockroach: "Cockroach",
  btn_svc_bed_bugs: "Bed bugs",
  btn_svc_general: "General",
  amc_logged:
    "Your AMC renewal request has been logged. Our team will call you within 1 working day.",
  escalate_ack:
    "We've passed this to our team. They'll get back to you shortly.",
  choose_date_prompt: "When would you like the visit?",
  btn_date_today: "Today",
  btn_date_tomorrow: "Tomorrow",
  btn_date_day_after: "Day after",
  choose_slot_prompt: "Pick a time slot:",
  btn_slot_morning: "Morning",
  btn_slot_afternoon: "Afternoon",
  btn_slot_evening: "Evening",
  confirm_slot_prompt: "Confirm: {slot}?",
  btn_confirm_yes: "Confirm",
  btn_confirm_change: "Change time",
  btn_confirm_cancel: "Cancel",
  booked_ack: "Booked ✅ — we'll send a reminder 24h before your visit.",
  booking_needs_address:
    "We don't have a service address on file for you yet. Our team will call you shortly to set this up, then we can complete your booking.",
  change_time_prompt: "No problem — when would you like the visit?",
  booking_cancelled: "No problem — booking cancelled.",

  review_great: "Wonderful! Would you leave us a quick Google review?",
  btn_review_yes: "Leave a review",
  btn_review_later: "Maybe later",
  review_bad: "Sorry to hear that. Would you like our manager to call you?",
  btn_complaint_yes: "Talk to manager",
  btn_complaint_no: "No thanks",
  review_sent_thanks:
    "Thank you! We've sent the review link in a follow-up message.",
  review_later_ack: "No problem — thanks for your time!",
  manager_will_call: "Our manager will call you shortly. Sorry for the trouble.",
  feedback_thanks: "Thanks for your feedback.",

  reminder_confirmed: "Great — see you then!",
  reschedule_prompt: "Sure — which pest are we treating?",
  visit_cancelled: "Your visit has been cancelled.",

  pay_link_sent: "Tap the link in our follow-up message to complete payment.",
  pay_link_body:
    "SENAQ payment link — ${amt}:\n{url}\n\nReply MENU anytime to return to options.",
  review_link_body:
    "Thanks again — your Google review helps a lot:\n{url}",
  pay_defer_prompt: "When would you like a reminder?",
  btn_defer_tomorrow: "Tomorrow",
  btn_defer_next_week: "Next week",
  dispute_flagged:
    "We've flagged this for our accounts team — they'll be in touch.",
  pay_defer_ack: "Got it — we'll remind you in {duration}.",
  duration_a_day: "a day",
  duration_a_week: "a week",

  btn_fup_continue: "Continue",
  btn_fup_restart: "Start over",
  btn_fup_no: "No thanks",
  fup_no_ack: "No problem — chat with us anytime.",
  fup_first_body:
    "Hi! Are you still there? You started a chat with us but didn't finish. Want to pick up where you left off?",
  fup_second_body:
    "Just checking in one more time — should we continue your chat, or close it?",

  fallback_prompt: "Please pick an option:",
  btn_talk_human: "Talk to human",

  slot_label_morning: "morning",
  slot_label_afternoon: "afternoon",
  slot_label_evening: "evening",
  confirm_slot_template: "{date} {label} ({hour}:00)",
};

export function t<K extends StringKey>(
  key: K,
  params?: Record<string, string | number>,
): string {
  let out = STRINGS[key];
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replace(`{${k}}`, String(v));
    }
  }
  return out;
}
