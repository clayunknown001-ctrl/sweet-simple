
ALTER TABLE public.feedback REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
