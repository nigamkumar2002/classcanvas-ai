
-- Extend exams table
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS exam_kind text NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS pyq_year integer,
  ADD COLUMN IF NOT EXISTS is_board_prep boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_exams_board_prep ON public.exams(school_id, is_board_prep, exam_kind);

-- Extend questions table
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS pyq_year integer,
  ADD COLUMN IF NOT EXISTS difficulty text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS question_hash text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS chapter_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_questions_hash_chapter
  ON public.questions(school_id, chapter_id, question_hash)
  WHERE question_hash IS NOT NULL AND chapter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_questions_chapter ON public.questions(chapter_id) WHERE chapter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_questions_pyq_year ON public.questions(school_id, pyq_year) WHERE pyq_year IS NOT NULL;

-- PYQ uploads
CREATE TABLE IF NOT EXISTS public.pyq_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  pyq_year integer,
  subject_id uuid,
  status text NOT NULL DEFAULT 'pending', -- pending|processing|completed|failed|approved
  questions_extracted integer NOT NULL DEFAULT 0,
  questions_inserted integer NOT NULL DEFAULT 0,
  questions_skipped integer NOT NULL DEFAULT 0,
  raw_ai_response jsonb,
  extracted_questions jsonb DEFAULT '[]'::jsonb,
  error_log text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pyq_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage PYQ uploads"
  ON public.pyq_uploads FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'developer'::app_role)
    OR (school_id = get_user_school_id(auth.uid())
        AND (has_role(auth.uid(), 'admin'::app_role)
             OR has_role(auth.uid(), 'super_admin'::app_role)))
  )
  WITH CHECK (
    has_role(auth.uid(), 'developer'::app_role)
    OR (school_id = get_user_school_id(auth.uid())
        AND (has_role(auth.uid(), 'admin'::app_role)
             OR has_role(auth.uid(), 'super_admin'::app_role)))
  );

CREATE TRIGGER trg_pyq_uploads_updated
  BEFORE UPDATE ON public.pyq_uploads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Revision items
CREATE TABLE IF NOT EXISTS public.revision_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  question_id uuid NOT NULL,
  chapter_id uuid,
  subject_id uuid,
  wrong_count integer NOT NULL DEFAULT 1,
  priority text NOT NULL DEFAULT 'medium', -- high|medium|low
  mastery_status text NOT NULL DEFAULT 'weak', -- weak|improving|mastered
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(student_id, question_id)
);

ALTER TABLE public.revision_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own revision"
  ON public.revision_items FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR has_role(auth.uid(), 'developer'::app_role)
    OR (school_id = get_user_school_id(auth.uid())
        AND (has_role(auth.uid(), 'teacher'::app_role)
             OR has_role(auth.uid(), 'admin'::app_role)
             OR has_role(auth.uid(), 'super_admin'::app_role)))
  );

CREATE POLICY "Students upsert own revision"
  ON public.revision_items FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid() AND school_id = get_user_school_id(auth.uid()));

CREATE POLICY "Students update own revision"
  ON public.revision_items FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE TRIGGER trg_revision_items_updated
  BEFORE UPDATE ON public.revision_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_revision_student ON public.revision_items(student_id, priority);

-- Board prep settings (per-school enabled class IDs)
CREATE TABLE IF NOT EXISTS public.board_prep_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE,
  enabled_class_ids uuid[] NOT NULL DEFAULT '{}',
  updated_by uuid,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.board_prep_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View board prep settings by school"
  ON public.board_prep_settings FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'developer'::app_role)
    OR school_id = get_user_school_id(auth.uid())
  );

CREATE POLICY "Manage board prep settings"
  ON public.board_prep_settings FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'developer'::app_role)
    OR (school_id = get_user_school_id(auth.uid())
        AND has_role(auth.uid(), 'super_admin'::app_role))
  )
  WITH CHECK (
    has_role(auth.uid(), 'developer'::app_role)
    OR (school_id = get_user_school_id(auth.uid())
        AND has_role(auth.uid(), 'super_admin'::app_role))
  );

CREATE TRIGGER trg_board_prep_settings_updated
  BEFORE UPDATE ON public.board_prep_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: is board prep enabled for current user
CREATE OR REPLACE FUNCTION public.is_board_prep_enabled_for_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.board_prep_settings bps ON bps.school_id = p.school_id
    WHERE p.user_id = _user_id
      AND p.class_id = ANY(bps.enabled_class_ids)
  );
$$;

-- Helper: list questions for a board-prep test (chapter pool or year-wise)
CREATE OR REPLACE FUNCTION public.get_board_prep_question_pool(
  _school_id uuid,
  _chapter_id uuid DEFAULT NULL,
  _subject_id uuid DEFAULT NULL,
  _pyq_year integer DEFAULT NULL,
  _limit integer DEFAULT 100
)
RETURNS TABLE(
  id uuid,
  question_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  marks integer,
  pyq_year integer,
  difficulty text,
  chapter_id uuid
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
         q.marks, q.pyq_year, q.difficulty, q.chapter_id
  FROM public.questions q
  WHERE q.school_id = _school_id
    AND q.source IN ('pyq', 'ai', 'manual')
    AND (_chapter_id IS NULL OR q.chapter_id = _chapter_id)
    AND (_subject_id IS NULL OR q.chapter_id IN (
      SELECT c.id FROM public.chapters c WHERE c.subject_id = _subject_id
    ))
    AND (_pyq_year IS NULL OR q.pyq_year = _pyq_year)
  ORDER BY random()
  LIMIT _limit;
$$;
