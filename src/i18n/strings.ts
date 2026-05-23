// Translation table for every customer-facing string.
//
// TypeScript enforces (via `Record<Language, Record<StringKey, string>>`) that
// every key exists in every language — adding "en" without "ar" is a compile error.

export type Language = "en" | "ar";

export type StringKey =
  // language picker
  | "lang_picker_prompt"
  | "btn_lang_en"
  | "btn_lang_ar"
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

const STRINGS: Record<Language, Record<StringKey, string>> = {
  en: {
    lang_picker_prompt: "Choose your language / اختر لغتك",
    btn_lang_en: "English",
    btn_lang_ar: "العربية",

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

    pay_link_sent:
      "Tap the link in our follow-up message to complete payment.",
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
  },

  ar: {
    lang_picker_prompt: "Choose your language / اختر لغتك",
    btn_lang_en: "English",
    btn_lang_ar: "العربية",

    menu_welcome: "أهلاً بك في سناك لمكافحة الحشرات 🐜 — كيف يمكننا مساعدتك؟",
    btn_book_service: "حجز خدمة",
    btn_amc_renewal: "تجديد العقد",
    btn_other: "أخرى",
    btn_main_menu: "القائمة الرئيسية",

    choose_service_prompt: "ما نوع الحشرة التي نعالجها؟",
    btn_svc_cockroach: "صراصير",
    btn_svc_bed_bugs: "بق الفراش",
    btn_svc_general: "عامة",
    amc_logged:
      "تم تسجيل طلب تجديد عقدك. سيتصل بك فريقنا خلال يوم عمل واحد.",
    escalate_ack: "تم تحويل طلبك إلى فريقنا وسيعودون إليك قريباً.",
    choose_date_prompt: "متى تود أن نقوم بالزيارة؟",
    btn_date_today: "اليوم",
    btn_date_tomorrow: "غداً",
    btn_date_day_after: "بعد غد",
    choose_slot_prompt: "اختر الوقت المناسب:",
    btn_slot_morning: "صباحاً",
    btn_slot_afternoon: "ظهراً",
    btn_slot_evening: "مساءً",
    confirm_slot_prompt: "تأكيد الموعد: {slot}؟",
    btn_confirm_yes: "تأكيد",
    btn_confirm_change: "تغيير الوقت",
    btn_confirm_cancel: "إلغاء",
    booked_ack: "تم الحجز ✅ — سنرسل تذكيراً قبل الزيارة بـ24 ساعة.",
    change_time_prompt: "لا مشكلة — متى تود أن نقوم بالزيارة؟",
    booking_cancelled: "لا مشكلة — تم إلغاء الحجز.",

    review_great: "ممتاز! هل تتكرم بترك تقييم سريع على جوجل؟",
    btn_review_yes: "كتابة تقييم",
    btn_review_later: "ربما لاحقاً",
    review_bad: "نأسف لذلك. هل تود أن يتصل بك المسؤول؟",
    btn_complaint_yes: "التحدث مع المسؤول",
    btn_complaint_no: "لا شكراً",
    review_sent_thanks: "شكراً لك! أرسلنا رابط التقييم في رسالة منفصلة.",
    review_later_ack: "لا مشكلة — شكراً لوقتك!",
    manager_will_call: "سيتصل بك المسؤول قريباً. نأسف على الإزعاج.",
    feedback_thanks: "شكراً على ملاحظاتك.",

    reminder_confirmed: "ممتاز — نراك حينها!",
    reschedule_prompt: "بالتأكيد — ما نوع الحشرة التي نعالجها؟",
    visit_cancelled: "تم إلغاء الزيارة.",

    pay_link_sent: "اضغط على الرابط في الرسالة التالية لإتمام الدفع.",
    pay_defer_prompt: "متى تود أن نذكرك؟",
    btn_defer_tomorrow: "غداً",
    btn_defer_next_week: "الأسبوع القادم",
    dispute_flagged: "تم تحويل طلبك إلى قسم الحسابات وسيتواصلون معك.",
    pay_defer_ack: "حسناً — سنذكرك بعد {duration}.",
    duration_a_day: "يوم واحد",
    duration_a_week: "أسبوع",

    btn_fup_continue: "متابعة",
    btn_fup_restart: "البدء من جديد",
    btn_fup_no: "لا شكراً",
    fup_no_ack: "لا مشكلة — تواصل معنا في أي وقت.",
    fup_first_body:
      "مرحباً! هل أنت معنا؟ بدأت محادثة ولم تكتملها. هل تود الاستكمال من حيث توقفت؟",
    fup_second_body:
      "نتأكد منك مرة أخيرة — هل نكمل المحادثة أم نغلقها؟",

    fallback_prompt: "الرجاء اختيار أحد الخيارات:",
    btn_talk_human: "التحدث مع موظف",

    slot_label_morning: "صباحاً",
    slot_label_afternoon: "ظهراً",
    slot_label_evening: "مساءً",
    confirm_slot_template: "{date} {label} (الساعة {hour}:00)",
  },
};

export function t<K extends StringKey>(
  lang: Language,
  key: K,
  params?: Record<string, string | number>,
): string {
  let out = STRINGS[lang][key];
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replace(`{${k}}`, String(v));
    }
  }
  return out;
}
