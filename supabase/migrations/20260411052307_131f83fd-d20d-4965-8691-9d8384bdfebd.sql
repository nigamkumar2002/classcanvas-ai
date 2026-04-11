ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admission_no text,
  ADD COLUMN IF NOT EXISTS roll_no text,
  ADD COLUMN IF NOT EXISTS section text,
  ADD COLUMN IF NOT EXISTS date_of_birth date;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_school_admission_no_unique
ON public.profiles (school_id, admission_no)
WHERE admission_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_school_role_idx
ON public.profiles (school_id, role);

CREATE INDEX IF NOT EXISTS profiles_school_class_role_idx
ON public.profiles (school_id, class_id, role);