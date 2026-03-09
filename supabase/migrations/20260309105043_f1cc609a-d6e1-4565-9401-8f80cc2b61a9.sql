-- Restrict direct question SELECT to staff roles only
DROP POLICY IF EXISTS "View questions by school" ON public.questions;

CREATE POLICY "Teachers can view questions by school"
ON public.questions
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'developer'::app_role)
  OR (
    school_id = get_user_school_id(auth.uid())
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'teacher'::app_role)
    )
  )
);

-- Student-safe question fetch (no correct_answer exposure)
CREATE OR REPLACE FUNCTION public.get_exam_questions_for_student(_exam_id uuid)
RETURNS TABLE (
  id uuid,
  exam_id uuid,
  question_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  marks integer,
  order_index integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    q.id,
    q.exam_id,
    q.question_text,
    q.option_a,
    q.option_b,
    q.option_c,
    q.option_d,
    q.marks,
    q.order_index
  FROM public.questions q
  WHERE q.exam_id = _exam_id
    AND q.school_id = public.get_user_school_id(auth.uid())
  ORDER BY q.order_index;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_questions_for_student(uuid) TO authenticated;

-- Server-side exam grading to avoid exposing correct answers pre-submission
CREATE OR REPLACE FUNCTION public.grade_exam_submission(_exam_id uuid, _answers jsonb)
RETURNS TABLE (
  score integer,
  reviewed_questions jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT
      id,
      exam_id,
      question_text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_answer,
      marks,
      order_index
    FROM public.questions
    WHERE exam_id = _exam_id
      AND school_id = public.get_user_school_id(auth.uid())
    ORDER BY order_index
  )
  SELECT
    COALESCE(SUM(CASE WHEN (_answers ->> q.id::text) = q.correct_answer THEN q.marks ELSE 0 END), 0)::integer AS score,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'exam_id', q.exam_id,
          'question_text', q.question_text,
          'option_a', q.option_a,
          'option_b', q.option_b,
          'option_c', q.option_c,
          'option_d', q.option_d,
          'correct_answer', q.correct_answer,
          'marks', q.marks,
          'order_index', q.order_index
        )
        ORDER BY q.order_index
      ),
      '[]'::jsonb
    ) AS reviewed_questions
  FROM q;
$$;

GRANT EXECUTE ON FUNCTION public.grade_exam_submission(uuid, jsonb) TO authenticated;