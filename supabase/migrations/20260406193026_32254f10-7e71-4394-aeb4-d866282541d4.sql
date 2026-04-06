
-- 1. Content Approvals
CREATE TABLE public.content_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL,
  content_id uuid NOT NULL,
  content_title text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  submitted_by uuid NOT NULL,
  reviewer_id uuid,
  comments text,
  school_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.content_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own submissions or as reviewer" ON public.content_approvals
FOR SELECT TO authenticated
USING (
  submitted_by = auth.uid()
  OR has_role(auth.uid(), 'developer'::app_role)
  OR (
    school_id = get_user_school_id(auth.uid())
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  )
);

CREATE POLICY "Submit content for approval" ON public.content_approvals
FOR INSERT TO authenticated
WITH CHECK (
  submitted_by = auth.uid()
  AND school_id = get_user_school_id(auth.uid())
);

CREATE POLICY "Review content approvals" ON public.content_approvals
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'developer'::app_role)
  OR (
    school_id = get_user_school_id(auth.uid())
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  )
);

-- 2. Attendance
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  class_id uuid NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'present',
  marked_by uuid NOT NULL,
  school_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, class_id, date)
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View attendance by school" ON public.attendance
FOR SELECT TO authenticated
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

CREATE POLICY "Mark attendance" ON public.attendance
FOR INSERT TO authenticated
WITH CHECK (
  school_id = get_user_school_id(auth.uid())
  AND (
    has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'developer'::app_role)
  )
);

CREATE POLICY "Update attendance" ON public.attendance
FOR UPDATE TO authenticated
USING (
  school_id = get_user_school_id(auth.uid())
  AND (
    has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'developer'::app_role)
  )
);

-- 3. Grades
CREATE TABLE public.grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  class_id uuid NOT NULL,
  exam_type text NOT NULL DEFAULT 'exam',
  marks_obtained numeric(6,2) NOT NULL DEFAULT 0,
  total_marks numeric(6,2) NOT NULL DEFAULT 100,
  grade_letter text,
  remarks text,
  graded_by uuid NOT NULL,
  school_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View grades by school" ON public.grades
FOR SELECT TO authenticated
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

CREATE POLICY "Manage grades" ON public.grades
FOR ALL TO authenticated
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
)
WITH CHECK (
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

-- 4. Messages
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  subject text,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  parent_message_id uuid REFERENCES public.messages(id),
  school_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own messages" ON public.messages
FOR SELECT TO authenticated
USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "Send messages" ON public.messages
FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND school_id = get_user_school_id(auth.uid()));

CREATE POLICY "Update read status" ON public.messages
FOR UPDATE TO authenticated
USING (recipient_id = auth.uid());

-- 5. Fee Records
CREATE TABLE public.fee_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL,
  fee_type text NOT NULL DEFAULT 'tuition',
  description text,
  status text NOT NULL DEFAULT 'pending',
  due_date date,
  paid_date date,
  receipt_number text,
  created_by uuid NOT NULL,
  school_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fee_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View fees by school" ON public.fee_records
FOR SELECT TO authenticated
USING (
  student_id = auth.uid()
  OR has_role(auth.uid(), 'developer'::app_role)
  OR (
    school_id = get_user_school_id(auth.uid())
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
);

CREATE POLICY "Manage fees" ON public.fee_records
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'developer'::app_role)
  OR (
    school_id = get_user_school_id(auth.uid())
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'developer'::app_role)
  OR (
    school_id = get_user_school_id(auth.uid())
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
);

-- 6. Certificates
CREATE TABLE public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  certificate_type text NOT NULL DEFAULT 'completion',
  certificate_url text,
  issued_by uuid NOT NULL,
  school_id uuid,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View certificates" ON public.certificates
FOR SELECT TO authenticated
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

CREATE POLICY "Issue certificates" ON public.certificates
FOR INSERT TO authenticated
WITH CHECK (
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

-- 7. Assignment Submissions
CREATE TABLE public.assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL,
  student_id uuid NOT NULL,
  file_url text,
  file_name text,
  submission_text text,
  status text NOT NULL DEFAULT 'submitted',
  grade numeric(6,2),
  feedback text,
  graded_by uuid,
  school_id uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  graded_at timestamptz,
  UNIQUE(material_id, student_id)
);
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View submissions" ON public.assignment_submissions
FOR SELECT TO authenticated
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

CREATE POLICY "Submit assignments" ON public.assignment_submissions
FOR INSERT TO authenticated
WITH CHECK (student_id = auth.uid() AND school_id = get_user_school_id(auth.uid()));

CREATE POLICY "Grade submissions" ON public.assignment_submissions
FOR UPDATE TO authenticated
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

-- 8. Feedback
CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  class_id uuid,
  subject_id uuid,
  teacher_id uuid,
  rating integer NOT NULL DEFAULT 5,
  comments text,
  is_anonymous boolean NOT NULL DEFAULT false,
  school_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View feedback" ON public.feedback
FOR SELECT TO authenticated
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

CREATE POLICY "Submit feedback" ON public.feedback
FOR INSERT TO authenticated
WITH CHECK (student_id = auth.uid() AND school_id = get_user_school_id(auth.uid()));

-- 9. Audit Logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  school_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View audit logs" ON public.audit_logs
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'developer'::app_role)
  OR (
    school_id = get_user_school_id(auth.uid())
    AND has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "Create audit logs" ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- 10. Study Plans
CREATE TABLE public.study_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  title text NOT NULL,
  subject_id uuid,
  planned_date date NOT NULL DEFAULT CURRENT_DATE,
  duration_minutes integer NOT NULL DEFAULT 60,
  is_completed boolean NOT NULL DEFAULT false,
  notes text,
  school_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own study plans" ON public.study_plans
FOR ALL TO authenticated
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid() AND school_id = get_user_school_id(auth.uid()));

CREATE POLICY "Teachers view student plans" ON public.study_plans
FOR SELECT TO authenticated
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

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.content_approvals;
