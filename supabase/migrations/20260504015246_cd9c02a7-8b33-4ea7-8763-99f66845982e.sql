ALTER TABLE public.written_questions
  ADD CONSTRAINT written_questions_chapter_id_fkey
  FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON DELETE CASCADE;

ALTER TABLE public.written_questions
  ADD CONSTRAINT written_questions_subject_id_fkey
  FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE SET NULL;

ALTER TABLE public.written_questions
  ADD CONSTRAINT written_questions_upload_id_fkey
  FOREIGN KEY (upload_id) REFERENCES public.pyq_uploads(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS public.uq_written_questions_hash;
CREATE UNIQUE INDEX IF NOT EXISTS uq_written_questions_hash_year
  ON public.written_questions(school_id, chapter_id, pyq_year, question_hash)
  WHERE question_hash IS NOT NULL;

DROP INDEX IF EXISTS public.uq_questions_hash_chapter;
CREATE UNIQUE INDEX IF NOT EXISTS uq_questions_hash_chapter_year
  ON public.questions(school_id, chapter_id, pyq_year, question_hash)
  WHERE question_hash IS NOT NULL AND chapter_id IS NOT NULL AND source = 'pyq';