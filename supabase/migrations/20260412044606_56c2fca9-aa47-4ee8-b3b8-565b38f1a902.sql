
-- Add a school-level content approval setting table
CREATE TABLE IF NOT EXISTS public.school_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT 'true'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id, key)
);

ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage school settings"
ON public.school_settings FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'developer'::app_role)
  OR (school_id = get_user_school_id(auth.uid()) AND has_role(auth.uid(), 'super_admin'::app_role))
)
WITH CHECK (
  has_role(auth.uid(), 'developer'::app_role)
  OR (school_id = get_user_school_id(auth.uid()) AND has_role(auth.uid(), 'super_admin'::app_role))
);

CREATE POLICY "School members can view school settings"
ON public.school_settings FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'developer'::app_role)
  OR school_id = get_user_school_id(auth.uid())
);
