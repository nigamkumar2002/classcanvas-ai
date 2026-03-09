-- Prevent users from escalating school/role via self-profile update
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update safe fields on own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND role = get_user_role(auth.uid())
  AND school_id = get_user_school_id(auth.uid())
  AND user_id = auth.uid()
);

-- Restrict broad role enumeration
DROP POLICY IF EXISTS "Users can view all roles" ON public.user_roles;

CREATE POLICY "Users can view scoped roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'developer'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Scope participant moderation writes to same-school sessions
DROP POLICY IF EXISTS "Teachers can approve participants" ON public.live_session_participants;
DROP POLICY IF EXISTS "Teachers can remove participants" ON public.live_session_participants;

CREATE POLICY "Teachers can approve participants in own school"
ON public.live_session_participants
FOR UPDATE
TO public
USING (
  (
    has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'developer'::app_role)
  )
  AND EXISTS (
    SELECT 1
    FROM public.live_sessions ls
    WHERE ls.id = live_session_participants.session_id
      AND (
        has_role(auth.uid(), 'developer'::app_role)
        OR ls.school_id = get_user_school_id(auth.uid())
      )
  )
);

CREATE POLICY "Teachers can remove participants in own school"
ON public.live_session_participants
FOR DELETE
TO public
USING (
  (
    has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'developer'::app_role)
  )
  AND EXISTS (
    SELECT 1
    FROM public.live_sessions ls
    WHERE ls.id = live_session_participants.session_id
      AND (
        has_role(auth.uid(), 'developer'::app_role)
        OR ls.school_id = get_user_school_id(auth.uid())
      )
  )
);

-- Avoid exposing all platform settings publicly
DROP POLICY IF EXISTS "Anyone can read platform settings" ON public.platform_settings;

CREATE POLICY "Public can read non-sensitive platform flags"
ON public.platform_settings
FOR SELECT
TO public
USING (key = 'show_demo_credentials');