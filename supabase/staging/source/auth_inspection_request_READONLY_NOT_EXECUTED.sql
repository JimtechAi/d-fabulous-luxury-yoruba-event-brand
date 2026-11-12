-- D'FABULOUS: PREPARED READ-ONLY INSPECTION REQUEST FOR AUTH AND PLATFORM OBJECTS  (NOT EXECUTED; AWAITING APPROVAL)
--
-- The public-only schema dump cannot show objects that live in managed schemas (auth, storage) or at cluster level. These queries
-- answer the open questions in auth_custom_objects_review.md. They are read-only: one READ ONLY transaction, SELECT only, and no
-- table data is read (no rows from auth.users, profiles, bookings, payments or messages; only catalog metadata).
-- Run by the project owner in the PRODUCTION SQL editor ONLY AFTER written approval, then export the result sets (they contain
-- definitions, not secrets). Do not paste connection strings or keys anywhere. Nothing is changed by this script.

BEGIN READ ONLY;

-- A1. Non-internal triggers on every table in the auth schema (expected: none, or the sign-up trigger such as on_auth_user_created).
SELECT 'A1 trigger' AS item, tgrelid::regclass::text AS object, tgname AS name, tgenabled::text AS enabled, pg_get_triggerdef(oid) AS definition
FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'auth'::regnamespace) ORDER BY 2, 3;

-- A2. Full definitions of the functions those triggers call (e.g. handle_new_user). Look for any copy of a role or permission
-- from raw_user_meta_data (user-controlled) versus raw_app_meta_data (server-controlled), and for default values assigned to role/is_active.
SELECT 'A2 trigger function' AS item, p.oid::regprocedure::text AS object, pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p WHERE p.oid IN (
  SELECT tgfoid FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'auth'::regnamespace)
) ORDER BY 2;

-- A3. Functions in the auth schema that are not part of an extension (custom objects added to the managed schema). Names and owners only.
SELECT 'A3 custom auth function' AS item, p.oid::regprocedure::text AS object, pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p WHERE p.pronamespace = 'auth'::regnamespace
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') ORDER BY 2;

-- A4. Row level security policies on auth and storage tables (custom policies on managed schemas).
SELECT 'A4 policy' AS item, schemaname || '.' || tablename AS object, policyname AS name, cmd, roles::text, qual, with_check
FROM pg_policies WHERE schemaname IN ('auth', 'storage') ORDER BY 2, 3;

-- A5. Storage buckets: names and public flag only (no object listing).
SELECT 'A5 bucket' AS item, id AS object, name, public::text AS is_public FROM storage.buckets ORDER BY 2;

-- A6. Public functions that the Auth service role can execute (identifies Auth Hooks such as a custom access token hook).
SELECT 'A6 auth hook candidate' AS item, p.oid::regprocedure::text AS object, pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
  AND has_function_privilege('supabase_auth_admin', p.oid, 'EXECUTE')
  AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') ORDER BY 2;

-- A7. Default privileges (the CLI public dump strips the ones for supabase_admin).
SELECT 'A7 default privilege' AS item, pg_get_userbyid(defaclrole) AS object, defaclnamespace::regnamespace::text AS name,
       defaclobjtype::text AS objtype, defaclacl::text AS acl
FROM pg_default_acl ORDER BY 2, 3, 4;

-- A8. Installed extensions with their schema and version (dependencies of the public schema).
SELECT 'A8 extension' AS item, extname AS object, extversion AS name, extnamespace::regnamespace::text AS schema FROM pg_extension ORDER BY 2;

-- A9. Event triggers and publications that involve the public schema.
SELECT 'A9 event trigger' AS item, evtname AS object, evtevent AS name, evtfoid::regproc::text AS function FROM pg_event_trigger ORDER BY 2;
SELECT 'A9 publication table' AS item, pubname AS object, schemaname || '.' || tablename AS name FROM pg_publication_tables WHERE schemaname = 'public' ORDER BY 2, 3;

-- A10. Which of the relations the application reads actually exist (answers the settings versus site_settings question). Names and kinds only.
SELECT 'A10 relation' AS item, n.nspname || '.' || c.relname AS object, c.relkind::text AS name
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('settings', 'site_settings', 'blocked_dates', 'profiles') ORDER BY 2;

-- A11. Version of the database engine (staging must match: PostgreSQL 17).
SELECT 'A11 version' AS item, current_setting('server_version') AS object, version() AS name;

ROLLBACK;

-- NOT SQL (Dashboard checks the owner records without screenshots of keys):
--   Authentication > Sign In / Providers: "Allow new users to sign up" (expected OFF), email confirmation, other providers.
--   Authentication > Hooks: any custom hook configured.
--   Project Settings > Infrastructure: PostgreSQL major version (expected 17).
