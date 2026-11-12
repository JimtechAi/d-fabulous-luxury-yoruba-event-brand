-- D'FABULOUS STAGE 4 / PHASE 2 / 07: hardened-state validation (READ-ONLY)
-- STATUS: PREPARED, NOT EXECUTED. Run on dfabulous-staging (qwoxxroszmwobnzqgndr) after 04, 05 and 06 (or after each of them: rows prefixed HA/HB/HC report one proposal each, and
-- a proposal that is not applied simply FAILS its rows). One READ ONLY transaction, one SELECT. The LAST row (check_id 'ZZ') is the verdict.
-- It verifies STRUCTURE (policies, privileges, function definitions, dependencies). It cannot exercise role switching on a real Supabase project; run the
-- staging application tests from the runbook for that. The generated block is produced by scripts/build-stage4-baseline.mjs; do not edit it by hand.

BEGIN READ ONLY;
SET LOCAL search_path = pg_catalog, pg_temp;

WITH
-- BEGIN GENERATED (scripts/build-stage4-baseline.mjs): expected policy set after proposal A
expected_policy_set(n, names_md5) AS (VALUES (48, 'd9adcd0f88ce10c2da1a81f838543edc')),
-- END GENERATED
expected_privileges(tbl, grantee, privs) AS (VALUES
  ('audit_logs',       'authenticated', 'SELECT'),
  ('bookings',         'authenticated', 'SELECT, UPDATE, DELETE'),
  ('payments',         'authenticated', 'SELECT, INSERT'),
  ('permissions',      'authenticated', 'SELECT'),
  ('profiles',         'authenticated', 'SELECT'),
  ('services',         'authenticated', 'SELECT'),
  ('user_permissions', 'authenticated', 'SELECT'),
  ('services',         'anon',          'SELECT'),
  ('audit_logs',       'service_role',  'SELECT, INSERT'),
  ('blocked_dates',    'service_role',  'SELECT, INSERT, DELETE'),
  ('bookings',         'service_role',  'SELECT, INSERT, UPDATE'),
  ('gallery',          'service_role',  'SELECT'),
  ('messages',         'service_role',  'SELECT, INSERT, UPDATE'),
  ('payments',         'service_role',  'SELECT'),
  ('profiles',         'service_role',  'SELECT, INSERT, UPDATE, DELETE'),
  ('services',         'service_role',  'SELECT'),
  ('site_settings',    'service_role',  'SELECT, INSERT, UPDATE'),
  ('testimonials',     'service_role',  'SELECT'),
  ('user_permissions', 'service_role',  'SELECT, INSERT, UPDATE, DELETE')
),
expected_expanded AS (SELECT tbl, grantee, trim(p) AS priv FROM expected_privileges, unnest(string_to_array(privs, ',')) AS p),
actual_privileges AS (
  SELECT t.tbl, g.grantee, p.priv, has_table_privilege(g.grantee, format('public.%I', t.tbl), p.priv) AS has
  FROM (SELECT DISTINCT tbl FROM expected_privileges UNION SELECT 'messages' UNION SELECT 'blocked_dates' UNION SELECT 'site_settings' UNION SELECT 'gallery' UNION SELECT 'testimonials') t
  CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS g(grantee)
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) AS p(priv)
),
privilege_diff AS (
  SELECT a.tbl, a.grantee, a.priv, a.has FROM actual_privileges a
  LEFT JOIN expected_expanded e ON e.tbl = a.tbl AND e.grantee = a.grantee AND e.priv = a.priv
  WHERE a.has <> (e.priv IS NOT NULL)
),
pol AS (
  SELECT tablename, policyname, cmd, permissive, roles, qual, with_check FROM pg_policies WHERE schemaname = 'public'
),
helper_fn AS (
  SELECT p.proname, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) AS def, p.oid
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('is_admin', 'is_owner', 'prevent_role_escalation')
),
checks(check_id, name, ok, detail) AS (
  SELECT 'H00', 'Phase 1 prerequisites: install marker and privilege normalisation snapshot',
         to_regclass('dfabulous_stage4.install_marker') IS NOT NULL AND EXISTS (SELECT 1 FROM dfabulous_stage4.snapshot_status WHERE scope = 'normalisation'),
         'applied proposals: ' || coalesce((SELECT string_agg(proposal, ',' ORDER BY proposal) FROM dfabulous_stage4.phase2_state), 'none')
  UNION ALL
  SELECT 'HA1', 'A: recorded as applied', EXISTS (SELECT 1 FROM dfabulous_stage4.phase2_state WHERE proposal = 'A'), 'phase2_state'
  UNION ALL
  SELECT 'HA2', 'A: profiles has the three SELECT policies and no INSERT/UPDATE/DELETE policy other than the restrictive denies',
         (SELECT count(*) FROM pol WHERE tablename = 'profiles' AND cmd = 'SELECT' AND permissive = 'PERMISSIVE') = 3
         AND NOT EXISTS (SELECT 1 FROM pol WHERE tablename = 'profiles' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL') AND permissive = 'PERMISSIVE'),
         (SELECT string_agg(policyname || ' ' || cmd, ', ') FROM pol WHERE tablename = 'profiles' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL') AND permissive = 'PERMISSIVE')
  UNION ALL
  SELECT 'HA3', 'A: user_permissions is read-only for browser roles (active owner/admin and own rows)',
         (SELECT string_agg(policyname, ',' ORDER BY policyname) FROM pol WHERE tablename = 'user_permissions' AND permissive = 'PERMISSIVE') = 'user_permissions_read_active_owner_admin,user_permissions_read_own'
         AND NOT EXISTS (SELECT 1 FROM pol WHERE tablename = 'user_permissions' AND permissive = 'PERMISSIVE' AND cmd <> 'SELECT'),
         (SELECT string_agg(policyname || ' ' || cmd, ', ') FROM pol WHERE tablename = 'user_permissions' AND permissive = 'PERMISSIVE')
  UNION ALL
  SELECT 'HA4', 'A: restrictive deny policies exist (13): INSERT/UPDATE/DELETE on 4 identity tables, DELETE on payments, for anon and authenticated',
         (SELECT count(*) FROM pol WHERE permissive = 'RESTRICTIVE' AND policyname LIKE 'stage4_deny_%' AND roles @> ARRAY['anon', 'authenticated']::name[]) = 13
         AND NOT EXISTS (SELECT 1 FROM pol WHERE permissive = 'RESTRICTIVE' AND policyname LIKE 'stage4_deny_%' AND coalesce(qual, 'false') <> 'false' AND coalesce(with_check, 'false') <> 'false'),
         'restrictive deny policies: ' || (SELECT count(*) FROM pol WHERE permissive = 'RESTRICTIVE' AND policyname LIKE 'stage4_deny_%')
  UNION ALL
  SELECT 'HA5', 'A: the complete policy set equals production minus the 3 dropped policies plus A''s 16 additions (names, commands, kinds)',
         (SELECT count(*) = e.n AND md5(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || permissive, E'\n' ORDER BY tablename || '|' || policyname || '|' || cmd || '|' || permissive COLLATE "C")) = e.names_md5 FROM pol, expected_policy_set e GROUP BY e.n, e.names_md5),
         'policies: ' || (SELECT count(*) FROM pol)
  UNION ALL
  SELECT 'HA6', 'A: no browser role has a write or maintenance privilege on the identity tables; payments have no table-level UPDATE or DELETE for browser roles',
         NOT EXISTS (SELECT 1 FROM unnest(ARRAY['profiles', 'permissions', 'user_permissions', 'audit_logs']) t CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) p
                     WHERE has_table_privilege('authenticated', 'public.' || t, p) OR has_table_privilege('anon', 'public.' || t, p))
         AND NOT has_table_privilege('authenticated', 'public.payments', 'UPDATE') AND NOT has_table_privilege('authenticated', 'public.payments', 'DELETE'),
         'privileges checked'
  UNION ALL
  SELECT 'HA7', 'A: audit_logs is append-only for service_role (SELECT, INSERT only)',
         has_table_privilege('service_role', 'public.audit_logs', 'SELECT') AND has_table_privilege('service_role', 'public.audit_logs', 'INSERT')
         AND NOT has_table_privilege('service_role', 'public.audit_logs', 'UPDATE') AND NOT has_table_privilege('service_role', 'public.audit_logs', 'DELETE') AND NOT has_table_privilege('service_role', 'public.audit_logs', 'TRUNCATE'),
         'audit_logs privileges checked'
  UNION ALL
  SELECT 'HA8', 'A: payments administration: active-admin restrictive UPDATE policy, column-level UPDATE on exactly the 7 editable columns, guard and audit triggers enabled, functions hardened and unreachable by API roles',
         EXISTS (SELECT 1 FROM pol WHERE tablename = 'payments' AND policyname = 'stage4_require_active_admin_update' AND cmd = 'UPDATE' AND permissive = 'RESTRICTIVE' AND qual LIKE '%is_admin()%' AND qual LIKE '%is_active%' AND with_check LIKE '%is_admin()%')
         AND NOT EXISTS (SELECT 1 FROM pol WHERE tablename = 'payments' AND cmd IN ('DELETE', 'ALL') AND permissive = 'PERMISSIVE')
         AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY['id', 'booking_id', 'user_id', 'amount', 'currency', 'payment_type', 'provider', 'status', 'gateway_reference', 'gateway_transaction_id', 'payment_method', 'customer_email', 'metadata', 'paid_at', 'created_at', 'updated_at']) c
                         WHERE has_column_privilege('authenticated', 'public.payments', c, 'UPDATE') <> (c IN ('amount', 'currency', 'payment_type', 'status', 'payment_method', 'metadata', 'paid_at'))
                            OR has_column_privilege('anon', 'public.payments', c, 'UPDATE') OR has_column_privilege('service_role', 'public.payments', c, 'UPDATE'))
         AND (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = 'public.payments'::regclass AND NOT t.tgisinternal AND t.tgenabled = 'O' AND (
                (t.tgname = 'trg_stage4_payments_guard' AND (t.tgtype & 1) = 1 AND (t.tgtype & 2) = 2 AND (t.tgtype & 16) = 16)
             OR (t.tgname = 'trg_stage4_payments_audit' AND (t.tgtype & 1) = 1 AND (t.tgtype & 2) = 0 AND (t.tgtype & 16) = 16))) = 2
         AND EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'stage4_payments_guard' AND NOT p.prosecdef AND p.proconfig @> ARRAY['search_path=""'] AND pg_get_functiondef(p.oid) LIKE '%adjustment_reason%')
         AND EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'stage4_payments_audit' AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""'] AND pg_get_functiondef(p.oid) LIKE '%payment.user_unlinked%')
         AND NOT EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) g(r) WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('stage4_payments_guard', 'stage4_payments_audit') AND has_function_privilege(g.r, p.oid, 'EXECUTE')),
         'payments administration checked'
  UNION ALL
  SELECT 'HA9', 'A: payments write paths are closed: no PUBLIC grant, no UPDATE/DELETE/TRUNCATE grant to any role except the owner and the 7 column grants to authenticated; no function writes to payments except through the owner-run FK actions',
         NOT EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid = 'public.payments'::regclass AND a.grantee <> c.relowner
                     AND (a.grantee = 0 OR a.privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')))
         AND NOT EXISTS (SELECT 1 FROM pg_attribute t CROSS JOIN LATERAL aclexplode(t.attacl) a WHERE t.attrelid = 'public.payments'::regclass AND t.attacl IS NOT NULL
                     AND a.grantee <> (SELECT relowner FROM pg_class WHERE oid = 'public.payments'::regclass)
                     AND NOT (a.grantee = 'authenticated'::regrole AND a.privilege_type = 'UPDATE' AND NOT a.is_grantable AND t.attname IN ('amount', 'currency', 'payment_type', 'status', 'payment_method', 'metadata', 'paid_at')))
         AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prosrc ~* '(update|delete\s+from|insert\s+into|truncate(\s+table)?)\s+(public\.)?"?payments\y'),
         'payments ACLs and function bodies checked'
  UNION ALL
  SELECT 'HB1', 'B: recorded as applied', EXISTS (SELECT 1 FROM dfabulous_stage4.phase2_state WHERE proposal = 'B'), 'phase2_state'
  UNION ALL
  SELECT 'HB2', 'B: prevent_role_escalation() is SECURITY INVOKER, search_path pinned empty, no service_role bypass by claims, strict IS TRUE owner test',
         EXISTS (SELECT 1 FROM helper_fn WHERE proname = 'prevent_role_escalation' AND NOT prosecdef AND proconfig @> ARRAY['search_path=""']
                 AND def LIKE '%current_user = ''service_role''%' AND def LIKE '%public.is_owner() IS TRUE%' AND def NOT LIKE '%request.jwt%' AND def NOT LIKE '%auth.role()%'),
         coalesce((SELECT CASE WHEN prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END FROM helper_fn WHERE proname = 'prevent_role_escalation'), 'missing')
  UNION ALL
  SELECT 'HB3', 'B: the BEFORE UPDATE row trigger on profiles exists and is enabled; the function is not executable by any API role',
         EXISTS (SELECT 1 FROM pg_trigger t JOIN helper_fn f ON f.oid = t.tgfoid WHERE f.proname = 'prevent_role_escalation' AND t.tgrelid = 'public.profiles'::regclass AND t.tgenabled = 'O' AND (t.tgtype & 2) = 2 AND (t.tgtype & 16) = 16 AND (t.tgtype & 1) = 1)
         AND NOT EXISTS (SELECT 1 FROM helper_fn f CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) g(r) WHERE f.proname = 'prevent_role_escalation' AND has_function_privilege(g.r, f.oid, 'EXECUTE')),
         'trigger and ACL checked'
  UNION ALL
  SELECT 'HC1', 'C: recorded as applied', EXISTS (SELECT 1 FROM dfabulous_stage4.phase2_state WHERE proposal = 'C'), 'phase2_state'
  UNION ALL
  SELECT 'HC2', 'C: is_admin() and is_owner() require is_active IS TRUE, stay SECURITY DEFINER with an empty search_path',
         (SELECT count(*) FROM helper_fn WHERE proname IN ('is_admin', 'is_owner') AND prosecdef AND proconfig @> ARRAY['search_path=""'] AND def LIKE '%is_active IS TRUE%') = 2,
         'helpers ok: ' || (SELECT count(*) FROM helper_fn WHERE proname IN ('is_admin', 'is_owner') AND prosecdef AND proconfig @> ARRAY['search_path=""'] AND def LIKE '%is_active IS TRUE%')
  UNION ALL
  SELECT 'HC3', 'C: helper EXECUTE is granted to authenticated only',
         NOT EXISTS (SELECT 1 FROM helper_fn f CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) g(r) WHERE f.proname IN ('is_admin', 'is_owner') AND has_function_privilege(g.r, f.oid, 'EXECUTE') <> (g.r = 'authenticated')),
         'execute matrix checked'
  UNION ALL
  SELECT 'HC4', 'C: every remaining policy that calls the helpers is covered by the corrected helpers (29 policies: 28 permissive + the payments active-admin requirement)',
         (SELECT count(*) FROM pol WHERE coalesce(qual, '') ~ 'is_(admin|owner)\(\)' OR coalesce(with_check, '') ~ 'is_(admin|owner)\(\)') = 29,
         'helper-based policies: ' || (SELECT count(*) FROM pol WHERE coalesce(qual, '') ~ 'is_(admin|owner)\(\)' OR coalesce(with_check, '') ~ 'is_(admin|owner)\(\)')
  UNION ALL
  SELECT 'HX1', 'least-privilege table matrix still holds exactly (anon, authenticated, service_role; 8 privilege types)',
         NOT EXISTS (SELECT 1 FROM privilege_diff),
         coalesce((SELECT string_agg(tbl || ':' || grantee || ':' || priv, ', ') FROM privilege_diff), 'matrix matches')
  UNION ALL
  SELECT 'HX2', 'RLS enabled on all 12 tables, FORCE on none',
         (SELECT count(*) FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname IN ('audit_logs', 'blocked_dates', 'bookings', 'gallery', 'messages', 'payments', 'permissions', 'profiles', 'services', 'site_settings', 'testimonials', 'user_permissions') AND c.relrowsecurity AND NOT c.relforcerowsecurity) = 12,
         'rls checked'
  UNION ALL
  SELECT 'HX3', 'profile deletion by the backend keeps referential integrity: audit_logs, bookings, messages, payments, site_settings keep their rows (SET NULL); only user_permissions cascades',
         (SELECT string_agg(c.relname || '.' || a.attname || ':' || k.confdeltype::text, ', ' ORDER BY c.relname, a.attname)
            FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
            WHERE k.contype = 'f' AND k.confrelid = 'public.profiles'::regclass AND k.connamespace = 'public'::regnamespace)
         = 'audit_logs.actor_user_id:n, audit_logs.target_user_id:n, bookings.user_id:n, messages.user_id:n, payments.user_id:n, site_settings.updated_by:n, user_permissions.user_id:c',
         'foreign keys to profiles checked'
  UNION ALL
  SELECT 'HX4', 'service_role can delete profiles (backend user removal) and nothing broader than the matrix',
         has_table_privilege('service_role', 'public.profiles', 'DELETE') AND NOT has_table_privilege('service_role', 'public.profiles', 'TRUNCATE'),
         'profiles service_role privileges checked'
  UNION ALL
  SELECT 'HX5', 'pg_cron is not installed',
         NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'),
         'pg_cron present: ' || EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
)
SELECT check_id, name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, detail FROM checks
UNION ALL
SELECT 'ZZ', 'VERDICT: hardened state (A + B + C) is in force',
       CASE WHEN NOT EXISTS (SELECT 1 FROM checks WHERE NOT ok) THEN 'PASS' ELSE 'FAIL' END,
       (SELECT count(*) FROM checks WHERE NOT ok) || ' failing check(s)'
ORDER BY check_id;

ROLLBACK;
