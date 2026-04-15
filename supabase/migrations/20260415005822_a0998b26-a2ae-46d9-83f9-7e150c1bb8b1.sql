
-- Add day_number column for simple sequential day planning
ALTER TABLE public.lesson_plans ADD COLUMN IF NOT EXISTS day_number integer;

-- Make planned_date have a default so it's not required
ALTER TABLE public.lesson_plans ALTER COLUMN planned_date SET DEFAULT CURRENT_DATE;

-- Make period_number have a default
ALTER TABLE public.lesson_plans ALTER COLUMN period_number SET DEFAULT 1;

-- Add file attachment columns to lesson_plans for direct content upload
ALTER TABLE public.lesson_plans ADD COLUMN IF NOT EXISTS file_url text;
ALTER TABLE public.lesson_plans ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE public.lesson_plans ADD COLUMN IF NOT EXISTS file_type text;
