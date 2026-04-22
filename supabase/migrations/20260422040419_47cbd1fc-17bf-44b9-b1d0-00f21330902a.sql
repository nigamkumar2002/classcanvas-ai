
-- Replace audit_logs SELECT policy with role-tiered access
DROP POLICY IF EXISTS "View audit logs" ON public.audit_logs;

CREATE POLICY "View audit logs tiered"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  -- Developer sees everything
  has_role(auth.uid(), 'developer'::app_role)
  OR (
    school_id = get_user_school_id(auth.uid())
    AND (
      -- Super admin: everyone in school
      has_role(auth.uid(), 'super_admin'::app_role)
      OR (
        -- Admin: students + teachers
        has_role(auth.uid(), 'admin'::app_role)
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = audit_logs.user_id
            AND ur.role IN ('student'::app_role, 'teacher'::app_role)
        )
      )
      OR (
        -- Teacher: students only
        has_role(auth.uid(), 'teacher'::app_role)
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = audit_logs.user_id
            AND ur.role = 'student'::app_role
        )
      )
      OR (
        -- Self-view always allowed
        user_id = auth.uid()
      )
    )
  )
);
