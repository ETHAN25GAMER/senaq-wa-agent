import { z } from "zod";

const EnvSchema = z.object({
  WHATSAPP_TOKEN: z.string().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1),
  WHATSAPP_APP_SECRET: z.string().min(1),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  CRON_SECRET: z.string().min(16),

  // Optional — used by generate-payment-link / send-review-link tools.
  // Until a real payment provider is wired up, PAYMENT_LINK_BASE just
  // points at a placeholder page that explains the link.
  PAYMENT_LINK_BASE: z.string().url().optional(),
  GOOGLE_REVIEW_URL: z.string().url().optional(),

  PORT: z.coerce.number().int().positive().default(3000),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export const config: AppConfig = EnvSchema.parse(process.env);
