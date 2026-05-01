-- ============ WIPE PYQ DATA (all schools) ============
DELETE FROM exam_results
WHERE exam_id IN (SELECT id FROM exams WHERE exam_kind = 'pyq_mock' OR is_board_prep = true);

DELETE FROM questions WHERE source = 'pyq';

DELETE FROM exams WHERE exam_kind = 'pyq_mock' OR is_board_prep = true;

DELETE FROM pyq_uploads;

-- Remove chapters that are now empty AND were tagged as PYQ-auto-created.
-- Heuristic: name starts with 'Unmapped PYQ' OR has zero questions and zero materials and was created in last 90 days from PYQ flow.
DELETE FROM chapters c
WHERE NOT EXISTS (SELECT 1 FROM questions q WHERE q.chapter_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM materials m WHERE m.chapter_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM exams e WHERE e.chapter_id = c.id)
  AND (c.name ILIKE 'Unmapped PYQ%' OR c.name ILIKE 'PYQ %');

-- ============ WRITTEN QUESTIONS TABLE ============
CREATE TABLE IF NOT EXISTS public.written_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL,
  chapter_id UUID NOT NULL,
  subject_id UUID,
  upload_id UUID,
  question_text TEXT NOT NULL,
  marks INTEGER NOT NULL DEFAULT 2,
  pyq_year INTEGER,
  question_type TEXT NOT NULL DEFAULT 'short_answer', -- short_answer | long_answer | very_short
  difficulty TEXT DEFAULT 'medium',
  source TEXT NOT NULL DEFAULT 'pyq',
  question_hash TEXT,
  tags TEXT[] DEFAULT '{}',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_written_questions_school ON public.written_questions(school_id);
CREATE INDEX IF NOT EXISTS idx_written_questions_chapter ON public.written_questions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_written_questions_subject ON public.written_questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_written_questions_year ON public.written_questions(pyq_year);
CREATE UNIQUE INDEX IF NOT EXISTS uq_written_questions_hash ON public.written_questions(school_id, chapter_id, question_hash);

ALTER TABLE public.written_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View written questions by school"
ON public.written_questions
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'developer'::app_role)
  OR school_id = get_user_school_id(auth.uid())
);

CREATE POLICY "Manage written questions by school"
ON public.written_questions
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'developer'::app_role)
  OR (
    school_id = get_user_school_id(auth.uid())
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'teacher'::app_role)
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
      OR has_role(auth.uid(), 'teacher'::app_role)
    )
  )
);

CREATE TRIGGER trg_written_questions_updated_at
BEFORE UPDATE ON public.written_questions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ extraction_meta on pyq_uploads ============
ALTER TABLE public.pyq_uploads
  ADD COLUMN IF NOT EXISTS extraction_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS written_extracted INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS written_inserted INTEGER NOT NULL DEFAULT 0;