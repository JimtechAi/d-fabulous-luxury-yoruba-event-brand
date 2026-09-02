-- ====================================================================
-- D'FABULOUS ADMIN ROLE + PERMISSION MIGRATION
-- ====================================================================
-- Purpose:
--   Add minimal database structures for admin roles, permissions, and audit
--   logging without disturbing existing production data or historical
--   migrations.
--
-- Safety:
--   - Idempotent
--   - Non-destructive
--   - Does not delete bookings, payments, gallery, testimonials, or users
--   - Uses existing profiles.auth architecture and keeps service role server-only
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permissions(permission_key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, permission_key)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permissions_key ON public.permissions(permission_key);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON public.user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_key ON public.user_permissions(permission_key);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON public.audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user_id ON public.audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

INSERT INTO public.permissions (permission_key, description)
VALUES
  ('bookings.view', 'View bookings')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.permissions (permission_key, description)
VALUES
  ('bookings.manage', 'Manage bookings'),
  ('messages.view', 'View messages'),
  ('messages.manage', 'Manage messages'),
  ('payments.view', 'View payments'),
  ('payments.manage', 'Manage payments'),
  ('testimonials.view', 'View testimonials'),
  ('testimonials.manage', 'Manage testimonials'),
  ('gallery.view', 'View gallery'),
  ('gallery.manage', 'Manage gallery'),
  ('services.view', 'View services'),
  ('services.manage', 'Manage services'),
  ('settings.view', 'View settings'),
  ('settings.manage', 'Manage settings'),
  ('users.view', 'View users'),
  ('users.manage', 'Manage users'),
  ('diagnostics.view', 'View diagnostics')
ON CONFLICT (permission_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.user_has_permission(p_user_id uuid, p_permission_key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.user_id = p_user_id
      AND up.permission_key = p_permission_key
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_any_permission(p_user_id uuid, p_permission_keys text[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.user_id = p_user_id
      AND up.permission_key = ANY(p_permission_keys)
  );
$$;

-- Allow only authenticated requests and the service role to use these helper functions.
REVOKE ALL ON FUNCTION public.user_has_permission(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_permission(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.user_has_permission(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.user_has_any_permission(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_any_permission(uuid, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.user_has_any_permission(uuid, text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_any_permission(uuid, text[]) TO service_role;

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "permissions_read_owner_admin" ON public.permissions;
CREATE POLICY "permissions_read_owner_admin"
ON public.permissions
FOR SELECT
TO authenticated
USING ( EXISTS (
  SELECT 1
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.role IN ('owner', 'admin')
));

DROP POLICY IF EXISTS "user_permissions_manage_owner_admin" ON public.user_permissions;
CREATE POLICY "user_permissions_manage_owner_admin"
ON public.user_permissions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('owner', 'admin')
  )
);

DROP POLICY IF EXISTS "audit_logs_read_owner_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_read_owner_admin"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'owner'
  )
);

DROP POLICY IF EXISTS "audit_logs_insert_owner_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_owner_admin"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('owner', 'admin')
  )
);

-- Keep public content tables readable by public while preserving private data restrictions.
-- This migration intentionally does not change existing customer or booking data.

-- The final service_role grants remain server-only by policy and should be reviewed in the live Supabase project.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.permissions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_permissions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.audit_logs TO service_role;

-- Final verification hints:
-- 1. SELECT relname, relrowsecurity FROM pg_class WHERE oid IN ('public.permissions'::regclass, 'public.user_permissions'::regclass, 'public.audit_logs'::regclass);
-- 2. SELECT * FROM pg_proc WHERE proname IN ('user_has_permission', 'user_has_any_permission');
-- 3. SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name IN ('permissions', 'user_permissions', 'audit_logs');
