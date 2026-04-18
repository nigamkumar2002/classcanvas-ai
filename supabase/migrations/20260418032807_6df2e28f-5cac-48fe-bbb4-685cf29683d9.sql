-- Ensure school_settings has unique constraint for upsert by (school_id, key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_settings_school_key_unique'
  ) THEN
    BEGIN
      ALTER TABLE public.school_settings
        ADD CONSTRAINT school_settings_school_key_unique UNIQUE (school_id, key);
    EXCEPTION WHEN duplicate_table THEN NULL;
    END;
  END IF;
END $$;

-- Ensure RLS allows admin/super_admin upserts on school_settings (if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='school_settings' AND policyname='Admins manage school settings') THEN
    EXECUTE $p$
      CREATE POLICY "Admins manage school settings" ON public.school_settings
      FOR ALL TO authenticated
      USING (
        public.has_role(auth.uid(), 'developer'::public.app_role)
        OR (school_id = public.get_user_school_id(auth.uid())
            AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
      )
      WITH CHECK (
        public.has_role(auth.uid(), 'developer'::public.app_role)
        OR (school_id = public.get_user_school_id(auth.uid())
            AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
      );
    $p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='school_settings' AND policyname='View school settings by school') THEN
    EXECUTE $p$
      CREATE POLICY "View school settings by school" ON public.school_settings
      FOR SELECT TO authenticated
      USING (
        public.has_role(auth.uid(), 'developer'::public.app_role)
        OR school_id = public.get_user_school_id(auth.uid())
      );
    $p$;
  END IF;
END $$;

-- Ensure RLS is enabled
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;