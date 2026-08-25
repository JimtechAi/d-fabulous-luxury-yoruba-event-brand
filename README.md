# D’Fabulous Luxury Yoruba Events

Luxury Yoruba event hosting, ceremonial leadership, and destination celebration services across the UK and internationally.

## Stack

- Vite and React 19
- TypeScript
- Tailwind CSS 4
- Express API server
- Supabase for content and enquiry storage
- Resend for optional server-side email notifications

## Local development

Prerequisite: Node.js 20 or newer.

```bash
npm install
npm run dev
```

The development server starts on port `3001` and fails clearly if that port is already occupied.

## Environment

Copy `.env.example` to `.env` and configure the values locally. Never commit `.env` or any private API key.

Required for database-backed functionality:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server environment only; required for public booking and contact submissions)
- `VITE_API_BASE_URL` (frontend-safe; leave empty for same-origin local development, set to the separate Express backend URL on Vercel)

Optional server-only integrations:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (keep `D'Fabulous Events <onboarding@resend.dev>` during development; replace only this value with a verified D’Fabulous sender later)
- `RESEND_NOTIFICATION_EMAIL`
- `GEMINI_API_KEY` (only for future server-side Gemini features)
- `CORS_ALLOWED_ORIGINS` (server-only comma-separated frontend origins, for example `https://dfabulous.co.uk`)

The Supabase anon key is a public client key and must still be protected by the database RLS policies. Never place a Supabase service-role key in a `VITE_` variable.

## Commands

```bash
npm run lint    # TypeScript validation
npm run build   # Vite frontend and bundled Express server
npm run start   # Run the production server after building
npm run preview # Preview the Vite build only
```

## API

The Express server provides health, enquiry, booking, and public content endpoints under `/api`. Booking and contact submissions are validated server-side, rate limited, stored in Supabase, and optionally forwarded through Resend.

## Deployment architecture

The production architecture is split: deploy the Vite frontend to Vercel and host the long-running Express API separately. Set the Vercel `VITE_API_BASE_URL` value to the public Express backend URL. Set the backend `CORS_ALLOWED_ORIGINS` value to the exact Vercel frontend origin(s). The existing `/api/*` paths and request/response contracts remain unchanged.

Do not deploy the static Vite output alone if booking and contact submissions are required. The Express backend remains responsible for API validation, rate limiting, Supabase service-role operations, email notifications, and admin API access.

The repository contains Supabase security migrations under `08 Development/`. Apply and verify `security_remediation_migration.sql`, `20260818_payments_rls_hardening.sql`, `20260819_public_data_access_hardening.sql`, and `20260819_submission_service_role_privileges.sql` in that order before exposing administrative data or accepting public submissions.

## Admin password recovery

The admin login page sends Supabase recovery emails to `/admin/reset-password` using the current origin. Add these URLs under Supabase Authentication > URL Configuration:

- `http://localhost:3001/admin/reset-password`
- `https://dfabulous.co.uk/admin/reset-password`

Keep the Supabase recovery email template based on `{{ .ConfirmationURL }}`. Do not replace it with a hard-coded URL. Add the production URL only after confirming the live domain.
