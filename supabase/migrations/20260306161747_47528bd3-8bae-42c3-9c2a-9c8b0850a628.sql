
-- Platform settings table (for developer to control demo credentials visibility etc.)
CREATE TABLE public.platform_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read platform settings
CREATE POLICY "Anyone can read platform settings" ON public.platform_settings
  FOR SELECT USING (true);

-- Only developers can manage platform settings
CREATE POLICY "Developers can manage platform settings" ON public.platform_settings
  FOR ALL USING (has_role(auth.uid(), 'developer'::app_role))
  WITH CHECK (has_role(auth.uid(), 'developer'::app_role));

-- Insert default setting
INSERT INTO public.platform_settings (key, value) VALUES ('show_demo_credentials', 'true'::jsonb);

-- Notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  school_id UUID REFERENCES public.schools(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Admins and teachers can create notifications" ON public.notifications
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'developer'::app_role) OR
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'teacher'::app_role)
  );

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Live session participants table (for join/approve flow)
CREATE TABLE public.live_session_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  approved_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(session_id, user_id)
);
ALTER TABLE public.live_session_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View participants by school" ON public.live_session_participants
  FOR SELECT USING (
    user_id = auth.uid() OR
    has_role(auth.uid(), 'developer'::app_role) OR
    has_role(auth.uid(), 'teacher'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Students can request to join" ON public.live_session_participants
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Teachers can approve participants" ON public.live_session_participants
  FOR UPDATE USING (
    has_role(auth.uid(), 'teacher'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_role(auth.uid(), 'developer'::app_role)
  );

CREATE POLICY "Teachers can remove participants" ON public.live_session_participants
  FOR DELETE USING (
    has_role(auth.uid(), 'teacher'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_role(auth.uid(), 'developer'::app_role)
  );

-- Enable realtime for live_session_participants
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_session_participants;

-- Add join_code and class_id to live_sessions
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS join_code TEXT;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES public.classes(id);

-- Announcements table
CREATE TABLE public.announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  created_by UUID NOT NULL,
  school_id UUID REFERENCES public.schools(id),
  target_role TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View announcements by school" ON public.announcements
  FOR SELECT USING (
    has_role(auth.uid(), 'developer'::app_role) OR
    school_id = get_user_school_id(auth.uid()) OR
    school_id IS NULL
  );

CREATE POLICY "Manage announcements" ON public.announcements
  FOR ALL USING (
    has_role(auth.uid(), 'developer'::app_role) OR
    (school_id = get_user_school_id(auth.uid()) AND (
      has_role(auth.uid(), 'admin'::app_role) OR
      has_role(auth.uid(), 'super_admin'::app_role) OR
      has_role(auth.uid(), 'teacher'::app_role)
    ))
  )
  WITH CHECK (
    has_role(auth.uid(), 'developer'::app_role) OR
    (school_id = get_user_school_id(auth.uid()) AND (
      has_role(auth.uid(), 'admin'::app_role) OR
      has_role(auth.uid(), 'super_admin'::app_role) OR
      has_role(auth.uid(), 'teacher'::app_role)
    ))
  );
