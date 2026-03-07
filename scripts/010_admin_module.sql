-- Admin module bootstrap policies
-- Enables global read/write access for users with profiles.role = 'admin'

CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = user_id
      AND p.role = 'admin'
  );
$$;

-- Core entities
DROP POLICY IF EXISTS "admin_full_access_organizations" ON public.organizations;
CREATE POLICY "admin_full_access_organizations" ON public.organizations
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin_full_access_profiles" ON public.profiles;
CREATE POLICY "admin_full_access_profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin_full_access_ponds" ON public.ponds;
CREATE POLICY "admin_full_access_ponds" ON public.ponds
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin_full_access_batches" ON public.batches;
CREATE POLICY "admin_full_access_batches" ON public.batches
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin_full_access_uploads" ON public.uploads;
CREATE POLICY "admin_full_access_uploads" ON public.uploads
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin_full_access_production_records" ON public.production_records;
CREATE POLICY "admin_full_access_production_records" ON public.production_records
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin_full_access_bioremediation" ON public.bioremediation_calcs;
CREATE POLICY "admin_full_access_bioremediation" ON public.bioremediation_calcs
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Optional tables added by later scripts
DO $$
BEGIN
  IF to_regclass('public.alerts') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "admin_full_access_alerts" ON public.alerts';
    EXECUTE 'CREATE POLICY "admin_full_access_alerts" ON public.alerts
      FOR ALL TO authenticated
      USING (public.is_admin(auth.uid()))
      WITH CHECK (public.is_admin(auth.uid()))';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.monthly_feed_records') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "admin_full_access_monthly_feed_records" ON public.monthly_feed_records';
    EXECUTE 'CREATE POLICY "admin_full_access_monthly_feed_records" ON public.monthly_feed_records
      FOR ALL TO authenticated
      USING (public.is_admin(auth.uid()))
      WITH CHECK (public.is_admin(auth.uid()))';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.harvest_records') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "admin_full_access_harvest_records" ON public.harvest_records';
    EXECUTE 'CREATE POLICY "admin_full_access_harvest_records" ON public.harvest_records
      FOR ALL TO authenticated
      USING (public.is_admin(auth.uid()))
      WITH CHECK (public.is_admin(auth.uid()))';
  END IF;
END $$;

-- Invitation code management (keeps existing public validation policies for signup)
DROP POLICY IF EXISTS "admin_full_access_invitation_codes" ON public.invitation_codes;
CREATE POLICY "admin_full_access_invitation_codes" ON public.invitation_codes
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
