
-- ============================================
-- TABLE: lesson_plans
-- ============================================
CREATE TABLE public.lesson_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  class_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  chapter_id uuid,
  school_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  planned_date date NOT NULL,
  period_number integer NOT NULL CHECK (period_number >= 1 AND period_number <= 8),
  duration_minutes integer NOT NULL DEFAULT 45,
  status text NOT NULL DEFAULT 'planned',
  objectives text,
  resources text,
  notes text,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lesson_plans ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_lesson_plans_teacher ON public.lesson_plans (teacher_id);
CREATE INDEX idx_lesson_plans_school_date ON public.lesson_plans (school_id, planned_date);
CREATE INDEX idx_lesson_plans_class_date ON public.lesson_plans (class_id, planned_date);

-- Teachers CRUD own plans
CREATE POLICY "Teachers manage own lesson plans"
ON public.lesson_plans FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'developer'::app_role)
  OR (
    school_id = get_user_school_id(auth.uid())
    AND (
      teacher_id = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'developer'::app_role)
  OR (
    school_id = get_user_school_id(auth.uid())
    AND (
      teacher_id = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
);

-- Students can view lesson plans for their class
CREATE POLICY "Students view class lesson plans"
ON public.lesson_plans FOR SELECT
TO authenticated
USING (
  school_id = get_user_school_id(auth.uid())
  AND has_role(auth.uid(), 'student'::app_role)
);

CREATE TRIGGER update_lesson_plans_updated_at
BEFORE UPDATE ON public.lesson_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- TABLE: homework_assignments
-- ============================================
CREATE TABLE public.homework_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_plan_id uuid REFERENCES public.lesson_plans(id) ON DELETE SET NULL,
  class_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  school_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  due_date date NOT NULL,
  assigned_date date NOT NULL DEFAULT CURRENT_DATE,
  max_marks integer,
  attachment_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.homework_assignments ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_homework_class ON public.homework_assignments (class_id, due_date);
CREATE INDEX idx_homework_teacher ON public.homework_assignments (teacher_id);

-- Teachers/admins manage homework
CREATE POLICY "Teachers manage homework"
ON public.homework_assignments FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'developer'::app_role)
  OR (
    school_id = get_user_school_id(auth.uid())
    AND (
      teacher_id = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'developer'::app_role)
  OR (
    school_id = get_user_school_id(auth.uid())
    AND (
      teacher_id = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
);

-- Students view homework for their school
CREATE POLICY "Students view homework"
ON public.homework_assignments FOR SELECT
TO authenticated
USING (
  school_id = get_user_school_id(auth.uid())
  AND has_role(auth.uid(), 'student'::app_role)
);

CREATE TRIGGER update_homework_assignments_updated_at
BEFORE UPDATE ON public.homework_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- TABLE: homework_submissions
-- ============================================
CREATE TABLE public.homework_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id uuid NOT NULL REFERENCES public.homework_assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  school_id uuid NOT NULL,
  submission_text text,
  file_url text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  grade numeric,
  feedback text,
  graded_by uuid,
  graded_at timestamptz,
  status text NOT NULL DEFAULT 'submitted'
);

ALTER TABLE public.homework_submissions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_hw_sub_homework ON public.homework_submissions (homework_id);
CREATE INDEX idx_hw_sub_student ON public.homework_submissions (student_id);

-- Students submit own homework
CREATE POLICY "Students submit homework"
ON public.homework_submissions FOR INSERT
TO authenticated
WITH CHECK (
  student_id = auth.uid()
  AND school_id = get_user_school_id(auth.uid())
);

-- Students view own submissions
CREATE POLICY "Students view own submissions"
ON public.homework_submissions FOR SELECT
TO authenticated
USING (
  student_id = auth.uid()
  OR has_role(auth.uid(), 'developer'::app_role)
  OR (
    school_id = get_user_school_id(auth.uid())
    AND (
      has_role(auth.uid(), 'teacher'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
);

-- Teachers/admins grade submissions
CREATE POLICY "Teachers grade submissions"
ON public.homework_submissions FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'developer'::app_role)
  OR (
    school_id = get_user_school_id(auth.uid())
    AND (
      has_role(auth.uid(), 'teacher'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
);
