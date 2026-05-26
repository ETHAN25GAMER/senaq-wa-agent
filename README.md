# SENAQ Pest Control — WhatsApp MCQ Agent

WhatsApp Business agent for SENAQ Pest Control. Customer interactions
are strictly button-based MCQ — never free text.

## Skills

1. Appointment chatbot
2. Post-service review request
3. Appointment reminders
4. Invoice reminders

## Setup

```bash
cp .env.example .env   # fill in secrets
npm install
npm run dev            # Hono server on PORT (default 3000)
```

Apply the Supabase migration in `supabase/migrations/` against your project.

## Endpoints

- `GET  /webhook`  — Meta verify handshake
- `POST /webhook`  — inbound WhatsApp events
- `GET  /healthz`  — liveness probe
