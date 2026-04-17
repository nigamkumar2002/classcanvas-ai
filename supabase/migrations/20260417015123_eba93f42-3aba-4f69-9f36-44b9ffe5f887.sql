
-- ============ COMPLAINTS SYSTEM ============
CREATE TABLE public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  raised_by uuid NOT NULL,
  raised_against uuid,
  against_role text,
  category text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  current_assignee uuid,
  current_level text NOT NULL DEFAULT 'teacher',
  escalation_count integer NOT NULL DEFAULT 0,
  last_reminder_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_complaints_school ON public.complaints(school_id);
CREATE INDEX idx_complaints_assignee ON public.complaints(current_assignee);
CREATE INDEX idx_complaints_status ON public.complaints(status);
CREATE INDEX idx_complaints_against ON public.complaints(raised_against);

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View complaints by participation"
ON public.complaints FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'developer'::app_role)
  OR (school_id = get_user_school_id(auth.uid()) AND (
    raised_by = auth.uid()
    OR raised_against = auth.uid()
    OR current_assignee = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  ))
);

CREATE POLICY "Anyone in school can raise complaint"
ON public.complaints FOR INSERT TO authenticated
WITH CHECK (raised_by = auth.uid() AND school_id = get_user_school_id(auth.uid()));

CREATE POLICY "Assignee or admin can update complaint"
ON public.complaints FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'developer'::app_role)
  OR (school_id = get_user_school_id(auth.uid()) AND (
    current_assignee = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  ))
);

CREATE POLICY "Super admin can delete complaints"
ON public.complaints FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'developer'::app_role)
  OR (school_id = get_user_school_id(auth.uid()) AND has_role(auth.uid(), 'super_admin'::app_role))
);

CREATE TRIGGER complaints_updated_at
BEFORE UPDATE ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Complaint responses
CREATE TABLE public.complaint_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  responder_id uuid NOT NULL,
  school_id uuid NOT NULL,
  message text NOT NULL,
  action_taken text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_complaint_responses_complaint ON public.complaint_responses(complaint_id);

ALTER TABLE public.complaint_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View responses if can see complaint"
ON public.complaint_responses FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'developer'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.complaints c
    WHERE c.id = complaint_responses.complaint_id
      AND c.school_id = get_user_school_id(auth.uid())
      AND (c.raised_by = auth.uid() OR c.raised_against = auth.uid() OR c.current_assignee = auth.uid()
           OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  )
);

CREATE POLICY "Authenticated can post responses to own/assigned complaints"
ON public.complaint_responses FOR INSERT TO authenticated
WITH CHECK (
  responder_id = auth.uid()
  AND school_id = get_user_school_id(auth.uid())
);

-- Activity log (audit trail)
CREATE TABLE public.complaint_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  school_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_complaint_activity_complaint ON public.complaint_activity(complaint_id);

ALTER TABLE public.complaint_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View activity if can see complaint"
ON public.complaint_activity FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'developer'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.complaints c
    WHERE c.id = complaint_activity.complaint_id
      AND c.school_id = get_user_school_id(auth.uid())
      AND (c.raised_by = auth.uid() OR c.raised_against = auth.uid() OR c.current_assignee = auth.uid()
           OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  )
);

CREATE POLICY "Insert activity log"
ON public.complaint_activity FOR INSERT TO authenticated
WITH CHECK (school_id = get_user_school_id(auth.uid()));

-- ============ LESSON PLAN ENHANCEMENTS ============
ALTER TABLE public.lesson_plans
  ADD COLUMN IF NOT EXISTS notepad_content jsonb,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE TABLE public.lesson_plan_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_plan_id uuid NOT NULL REFERENCES public.lesson_plans(id) ON DELETE CASCADE,
  school_id uuid NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  order_index integer NOT NULL DEFAULT 0,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lpa_plan ON public.lesson_plan_attachments(lesson_plan_id);

ALTER TABLE public.lesson_plan_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View attachments by school"
ON public.lesson_plan_attachments FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'developer'::app_role) OR school_id = get_user_school_id(auth.uid()));

CREATE POLICY "Manage attachments by teacher/admin"
ON public.lesson_plan_attachments FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'developer'::app_role)
  OR (school_id = get_user_school_id(auth.uid()) AND (
    has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  ))
)
WITH CHECK (
  has_role(auth.uid(), 'developer'::app_role)
  OR (school_id = get_user_school_id(auth.uid()) AND (
    has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  ))
);

-- Update student view policy to ONLY see approved plans
DROP POLICY IF EXISTS "Students view class lesson plans" ON public.lesson_plans;
CREATE POLICY "Students view approved plans in class"
ON public.lesson_plans FOR SELECT TO authenticated
USING (
  school_id = get_user_school_id(auth.uid())
  AND has_role(auth.uid(), 'student'::app_role)
  AND approval_status = 'approved'
);

-- ============ PRACTICE TESTS ============
CREATE TABLE public.practice_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  school_id uuid NOT NULL,
  subject_id uuid,
  chapter_id uuid,
  topic text,
  num_questions integer NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  generated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  score integer,
  total_marks integer
);

CREATE INDEX idx_practice_tests_student ON public.practice_tests(student_id);

ALTER TABLE public.practice_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own practice tests"
ON public.practice_tests FOR ALL TO authenticated
USING (student_id = auth.uid() OR has_role(auth.uid(), 'developer'::app_role))
WITH CHECK (student_id = auth.uid() AND school_id = get_user_school_id(auth.uid()));

CREATE TABLE public.practice_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_test_id uuid NOT NULL REFERENCES public.practice_tests(id) ON DELETE CASCADE,
  school_id uuid NOT NULL,
  question_text text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL,
  option_d text NOT NULL,
  correct_answer text NOT NULL,
  marks integer NOT NULL DEFAULT 1,
  order_index integer NOT NULL DEFAULT 0,
  student_answer text
);

CREATE INDEX idx_practice_questions_test ON public.practice_questions(practice_test_id);

ALTER TABLE public.practice_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students access own practice questions"
ON public.practice_questions FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.practice_tests pt
          WHERE pt.id = practice_questions.practice_test_id
            AND (pt.student_id = auth.uid() OR has_role(auth.uid(), 'developer'::app_role)))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.practice_tests pt
          WHERE pt.id = practice_questions.practice_test_id
            AND pt.student_id = auth.uid())
);

CREATE TABLE public.practice_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE,
  school_id uuid NOT NULL,
  quota_start_date timestamptz NOT NULL DEFAULT now(),
  questions_used integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.practice_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own quota"
ON public.practice_quotas FOR SELECT TO authenticated
USING (
  student_id = auth.uid()
  OR has_role(auth.uid(), 'developer'::app_role)
  OR (school_id = get_user_school_id(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)
  ))
);

-- Auto-escalation function (called by edge function via cron)
CREATE OR REPLACE FUNCTION public.escalate_stale_complaints()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  escalated_count integer := 0;
  c record;
  next_level text;
  next_assignee uuid;
BEGIN
  FOR c IN
    SELECT * FROM public.complaints
    WHERE status IN ('open', 'in_progress')
      AND created_at < now() - interval '7 days'
      AND (last_reminder_at IS NULL OR last_reminder_at < now() - interval '7 days')
      AND escalation_count < 3
  LOOP
    -- Determine next level
    next_level := CASE c.current_level
      WHEN 'teacher' THEN 'admin'
      WHEN 'admin' THEN 'super_admin'
      ELSE 'super_admin'
    END;

    -- Find an admin/super_admin in the school
    SELECT user_id INTO next_assignee
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE p.school_id = c.school_id
      AND ur.role::text = next_level
    LIMIT 1;

    UPDATE public.complaints
    SET current_level = next_level,
        current_assignee = COALESCE(next_assignee, current_assignee),
        escalation_count = escalation_count + 1,
        last_reminder_at = now(),
        status = 'escalated',
        updated_at = now()
    WHERE id = c.id;

    INSERT INTO public.complaint_activity (complaint_id, actor_id, action, details, school_id)
    VALUES (c.id, NULL, 'auto_escalated',
            jsonb_build_object('to_level', next_level, 'reason', '7 days unresolved'),
            c.school_id);

    -- Notification to the new assignee
    IF next_assignee IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, school_id, title, message, type, link)
      VALUES (next_assignee, c.school_id,
              'Complaint escalated to you',
              'A complaint has been auto-escalated and requires your attention.',
              'warning', '/complaints');
    END IF;

    escalated_count := escalated_count + 1;
  END LOOP;

  RETURN escalated_count;
END;
$$;

-- Teacher rating helper function
CREATE OR REPLACE FUNCTION public.get_teacher_rating(_teacher_id uuid)
RETURNS TABLE(complaints_against integer, complaints_resolved integer, rating numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COUNT(*) FILTER (WHERE raised_against = _teacher_id)::integer AS complaints_against,
    COUNT(*) FILTER (WHERE current_assignee = _teacher_id AND status = 'resolved')::integer AS complaints_resolved,
    GREATEST(0, 5.0 -
      (COUNT(*) FILTER (WHERE raised_against = _teacher_id AND status != 'resolved')::numeric * 0.5) +
      (COUNT(*) FILTER (WHERE current_assignee = _teacher_id AND status = 'resolved')::numeric * 0.1)
    )::numeric(3,2) AS rating
  FROM public.complaints
  WHERE raised_against = _teacher_id OR current_assignee = _teacher_id;
$$;
