
-- Add meeting_link column for external meeting links (Google Meet, Zoom, Teams)
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS meeting_link text;

-- Enable realtime for live_sessions so students detect session start/end
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'live_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'live_session_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_session_participants;
  END IF;
END
$$;
