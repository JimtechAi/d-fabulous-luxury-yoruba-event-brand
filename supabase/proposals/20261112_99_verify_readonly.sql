-- D'FABULOUS STAGE 2: READ-ONLY VERIFICATION (a single SELECT; changes nothing)
-- Run after each stage on STAGING. Expected values per stage are in docs/STAGE2_STAGING_VALIDATION.md.
-- Columns: check_name, applies_after (which proposal makes it true), ok (true = as intended).

with identity(tbl) as (values ('profiles'), ('permissions'), ('user_permissions'), ('audit_logs'))
select * from (
  select 'A: authenticated/anon/PUBLIC hold no write privilege on the identity tables' as check_name, 'A' as applies_after,
         not exists (
           select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
           where c.oid in (select format('public.%I', tbl)::regclass from identity)
             and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon','authenticated'))
             and a.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
         ) as ok
  union all
  select 'A: anon holds no privilege at all on the identity tables', 'A',
         not exists (
           select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
           where c.oid in (select format('public.%I', tbl)::regclass from identity) and pg_get_userbyid(a.grantee) = 'anon'
         )
  union all
  select 'A: no permissive write policy remains on profiles, user_permissions, audit_logs', 'A',
         not exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('profiles','user_permissions','audit_logs')
                     and permissive = 'PERMISSIVE' and cmd in ('ALL','INSERT','UPDATE','DELETE'))
  union all
  select 'A: nine restrictive deny policies are present', 'A',
         (select count(*) from pg_policies where schemaname = 'public' and tablename in ('profiles','user_permissions','audit_logs')
          and permissive = 'RESTRICTIVE' and policyname like 'deny_direct_%') = 9
  union all
  select 'A: RLS is enabled on all four identity tables', 'A',
         (select count(*) from pg_class where oid in (select format('public.%I', tbl)::regclass from identity) and relrowsecurity) = 4
  union all
  select 'B: prevent_role_escalation() is SECURITY INVOKER, pins search_path and allows service_role', 'B',
         (select not prosecdef and proconfig::text like '%search_path=%' and pg_get_functiondef(oid) like '%service_role%'
          from pg_proc where oid = 'public.prevent_role_escalation()'::regprocedure)
  union all
  select 'B: the role trigger is still attached to profiles (BEFORE UPDATE)', 'B',
         exists (select 1 from pg_trigger t where t.tgrelid = 'public.profiles'::regclass and t.tgfoid = 'public.prevent_role_escalation()'::regprocedure and not t.tgisinternal and (t.tgtype & 2) = 2 and (t.tgtype & 16) = 16)
  union all
  select 'B/C: browser roles cannot execute the trigger function', 'B',
         not has_function_privilege('authenticated', 'public.prevent_role_escalation()', 'EXECUTE') and not has_function_privilege('anon', 'public.prevent_role_escalation()', 'EXECUTE')
  union all
  select 'C: is_admin() and is_owner() require an active profile', 'C',
         (select bool_and(pg_get_functiondef(p) like '%is_active IS DISTINCT FROM false%') from unnest(array['public.is_admin()'::regprocedure, 'public.is_owner()'::regprocedure]) p)
  union all
  select 'C: helpers stay executable by authenticated only (not anon)', 'C',
         has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE') and has_function_privilege('authenticated', 'public.is_owner()', 'EXECUTE')
         and not has_function_privilege('anon', 'public.is_admin()', 'EXECUTE') and not has_function_privilege('anon', 'public.is_owner()', 'EXECUTE')
  union all
  select 'ALL: the snapshot table exists and browser roles and service_role cannot read it', 'A/B/C',
         to_regclass('public.security_remediation_snapshots') is not null
         and not has_table_privilege('authenticated', 'public.security_remediation_snapshots', 'SELECT')
         and not has_table_privilege('anon', 'public.security_remediation_snapshots', 'SELECT')
         and not has_table_privilege('service_role', 'public.security_remediation_snapshots', 'SELECT')
  union all
  select 'ALL: service_role still has its privileges on the identity tables the API writes', 'A/B/C',
         has_table_privilege('service_role', 'public.profiles', 'SELECT, INSERT, UPDATE, DELETE')
         and has_table_privilege('service_role', 'public.user_permissions', 'SELECT, INSERT, UPDATE, DELETE')
         and has_table_privilege('service_role', 'public.audit_logs', 'SELECT, INSERT')
) checks
order by applies_after, check_name;
