-- D'FABULOUS ADMIN SETTINGS PRIVILEGES
-- Grants table access required by the existing site_settings RLS policies.
-- RLS remains enabled and restricts settings reads/writes to authorized admins.

REVOKE SELECT ON TABLE public.site_settings FROM anon;
GRANT SELECT ON TABLE public.site_settings TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.site_settings TO authenticated;

DROP POLICY IF EXISTS "Public read site_settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admins read site_settings" ON public.site_settings;
CREATE POLICY "Admins read site_settings"
ON public.site_settings
FOR SELECT
TO authenticated
USING (public.is_admin());
