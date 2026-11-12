-- D'FABULOUS STAGE 2: READ-ONLY INSPECTION (run in the Supabase SQL editor of a STAGING project, and, by the owner/DBA only, on production)
-- Every statement is a SELECT. Nothing here changes any object. Save the complete output BEFORE applying any proposal.

-- 1. Which migration variants are live? (is_owner(): look for "RETURN v_role = 'owner'" (NULL-returning) or "RETURN EXISTS" (false-returning))
select 'is_owner' as object, pg_get_functiondef('public.is_owner()'::regprocedure) as definition
union all select 'is_admin', pg_get_functiondef('public.is_admin()'::regprocedure)
union all select 'prevent_role_escalation', pg_get_functiondef('public.prevent_role_escalation()'::regprocedure);

-- 2. Triggers on the tables the proposals reference
select tgrelid::regclass as table_name, tgname, tgenabled, pg_get_triggerdef(oid) as definition
from pg_trigger where not tgisinternal and tgrelid in ('public.profiles'::regclass, 'public.payments'::regclass, 'public.user_permissions'::regclass, 'public.audit_logs'::regclass);

-- 3. Columns of profiles (the repository never defines this table; proposals A-C assume only id, role, email, is_active)
select column_name, data_type, is_nullable, column_default from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' order by ordinal_position;

-- 4. Constraints and foreign keys on the identity tables
select conrelid::regclass as table_name, conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid in ('public.profiles'::regclass,'public.permissions'::regclass,'public.user_permissions'::regclass,'public.audit_logs'::regclass) order by 1,2;

-- 5. Row level security flags and every policy
select relname, relrowsecurity, relforcerowsecurity from pg_class
where oid in ('public.profiles'::regclass,'public.permissions'::regclass,'public.user_permissions'::regclass,'public.audit_logs'::regclass);
select tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies
where schemaname = 'public' and tablename in ('profiles','permissions','user_permissions','audit_logs') order by 1,2;

-- 6. Table privileges of the roles that matter
select c.relname as table_name, case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee, string_agg(a.privilege_type, ', ' order by a.privilege_type) as privileges
from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
where c.oid in ('public.profiles'::regclass,'public.permissions'::regclass,'public.user_permissions'::regclass,'public.audit_logs'::regclass)
group by 1,2 order by 1,2;

-- 7. Function privileges for the helpers and the trigger function
select p.oid::regprocedure as function, case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee, a.privilege_type
from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
where p.oid in ('public.is_admin()'::regprocedure,'public.is_owner()'::regprocedure,'public.prevent_role_escalation()'::regprocedure) order by 1,2;

-- 8. Account state that proposals B and C interact with
select role, is_active, count(*) as accounts from public.profiles group by 1,2 order by 1,2;

-- 9. Sign-up path (the repository does not define one): triggers on auth.users and their bodies
select t.tgname, pg_get_triggerdef(t.oid) from pg_trigger t where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;
select p.proname, pg_get_functiondef(p.oid) from pg_proc p join pg_trigger t on t.tgfoid = p.oid where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;
