
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS topic text;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS topic text;
