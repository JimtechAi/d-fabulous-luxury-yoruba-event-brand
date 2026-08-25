-- D'FABULOUS SERVER SUBMISSION PRIVILEGES
-- Apply after 20260819_public_data_access_hardening.sql.
--
-- Public booking and contact forms are validated and rate-limited in server.ts,
-- then saved with SUPABASE_SERVICE_ROLE_KEY. This role is never exposed to browsers.

BEGIN;

GRANT INSERT ON TABLE public.bookings TO service_role;
GRANT INSERT ON TABLE public.messages TO service_role;

COMMIT;

-- Verification: expect INSERT for service_role on both tables.
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'service_role'
  AND table_name IN ('bookings', 'messages')
ORDER BY table_name, privilege_type;