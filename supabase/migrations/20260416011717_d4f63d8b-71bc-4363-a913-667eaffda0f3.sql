
-- Add scheduling and publishing columns to exams
ALTER TABLE public.exams
ADD COLUMN IF NOT EXISTS scheduled_date date,
ADD COLUMN IF NOT EXISTS scheduled_start_time time,
ADD COLUMN IF NOT EXISTS scheduled_end_time time,
ADD COLUMN IF NOT EXISTS publish_status text NOT NULL DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS day_plan_id uuid,
ADD COLUMN IF NOT EXISTS leaderboard_visible boolean NOT NULL DEFAULT false;

-- Allow cascade delete of exam_results when exam is deleted
ALTER TABLE public.exam_results DROP CONSTRAINT IF EXISTS exam_results_exam_id_fkey;
ALTER TABLE public.exam_results ADD CONSTRAINT exam_results_exam_id_fkey
  FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE;

-- Allow cascade delete of questions when exam is deleted
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_exam_id_fkey;
ALTER TABLE public.questions ADD CONSTRAINT questions_exam_id_fkey
  FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE;
