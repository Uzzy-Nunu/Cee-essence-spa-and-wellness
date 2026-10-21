# Cee Essence Spa & Wellness

Next.js 15 booking and operations site backed by Supabase.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Set the Supabase URL, anon key, service-role key, and a long random `RATE_LIMIT_SECRET`.
3. For email and the concierge, set a verified Resend sender and Gemini API key.
4. Install and run:

   ```sh
   npm install
   npm run dev
   ```

5. Run `npm test` and `npm run build` before deploying.

On local Windows development, Next.js writes its build cache under `node_modules/.cache/next` to avoid OneDrive reparse-point errors. Vercel uses the standard `.next` output directory required by its deployment builder.

## Features

- Public service and therapist pages with live slot availability and appointment requests.
- Staff-only operations dashboard for appointments, services, therapists and their service assignments, therapist time off, business hours, blocked dates, support tickets, and spa settings.
- Booking-request and appointment status emails through Resend; deduplicated next-day reminders through the scheduled `/api/reminders` endpoint.
- Gemini-powered chat concierge with per-browser conversation history and human support-ticket handoff.
- Database-backed rate limits for booking, chat, and support-ticket APIs.

The original Supabase schema has already been applied to the project. Do not rerun `supabase/schema.sql` or `supabase/data-update.sql`. Before deploying this version, apply the additive migrations `supabase/migrations/20261006120000_booking_delivery_and_conflicts.sql`, `supabase/migrations/20261020_add_payment_status.sql`, and `supabase/migrations/20261020_security_hardening.sql` in the Supabase SQL editor. They add an appointment overlap constraint, notification delivery ledger, atomic API rate-limit function, payment fields and role-aware RLS policies, and remove public appointment and support-ticket insert policies. The overlap migration expects no existing overlapping appointments for the same therapist; resolve any such rows before applying it.

## Required configuration

Set the following in `.env.local` and in the hosting provider's production environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` (trusted HTTPS public site origin used to build payment callbacks; use `http://localhost:3000` only for local development)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only; never expose or commit it)
- `RATE_LIMIT_SECRET` (long, random value used to hash client IPs for rate-limit keys; if omitted, the server logs a warning and derives a purpose-specific key from `SUPABASE_SERVICE_ROLE_KEY`)
- `CRON_SECRET` (long, random value sent as a bearer token to the reminder endpoint)
- `KNOWLEDGE_INGEST_SECRET` (long, random value protecting the knowledge-ingestion endpoint)

For email, set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to a verified sender. For chat, set `GEMINI_API_KEY`; `GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`. `SLACK_WEBHOOK_URL` is optional and sends staff alerts for new support tickets.
For online deposits, configure `PAYSTACK_SECRET_KEY`; keep it server-side and never add the `NEXT_PUBLIC_` prefix.

Create staff accounts from the Super Admin Team tab, which stores each role in the server-controlled `admin_users.role` column. Regular admins can view operational data and update support tickets; Super Admins can manage spa data and team accounts. The dashboard uses authenticated Supabase requests protected by role-aware RLS policies, and privileged APIs independently validate Supabase access tokens and staff roles. Do not use editable Auth user metadata to grant roles.

If the owner can sign in but sees an access-restricted message, run `supabase/admin-setup.sql` in the Supabase SQL Editor. It adds the owner’s existing Auth account to `admin_users` as a Super Admin and prints the resulting authorization status; it does not reset the account password.

`vercel.json` schedules the reminder job daily at 08:00 UTC. It sends deduplicated next-day reminders in Abuja's timezone and retries eligible failed booking/status emails (up to five attempts within seven days). Set `CRON_SECRET` in Vercel so scheduled requests are authorized. Email delivery requires the database migration and both Resend variables.

## Production launch checklist

- Apply the additive SQL migrations after confirming the overlap constraint can be created; verify the designated owner is a Super Admin.
- Configure and verify all production environment variables; use distinct strong random secrets for rate limiting and cron authentication.
- Verify Resend domain/sender and send test booking, status-change, and reminder emails.
- Create admin users and verify non-admin accounts cannot access staff data.
- Verify the Vercel scheduled job is enabled and inspect its execution logs.
- Test booking, cancellation, staff status changes, time off, blocked dates, support handoff, and concurrent booking attempts against the production Supabase project.
