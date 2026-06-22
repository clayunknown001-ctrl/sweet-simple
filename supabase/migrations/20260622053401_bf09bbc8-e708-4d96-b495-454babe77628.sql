
ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS admin_reply text,
  ADD COLUMN IF NOT EXISTS admin_responder_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_responder_email text,
  ADD COLUMN IF NOT EXISTS admin_responded_at timestamptz;

-- Allow admins/owners to update feedback (status + reply)
DROP POLICY IF EXISTS "Admins update feedback" ON public.feedback;
CREATE POLICY "Admins update feedback" ON public.feedback
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

-- RPC to reply + set status, atomic
CREATE OR REPLACE FUNCTION public.reply_feedback(_id uuid, _reply text, _status text DEFAULT 'resolved')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _email text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF _status NOT IN ('open','pending','resolved') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  SELECT email INTO _email FROM public.profiles WHERE id = auth.uid();
  UPDATE public.feedback
     SET admin_reply = _reply,
         admin_responder_id = auth.uid(),
         admin_responder_email = _email,
         admin_responded_at = now(),
         status = _status
   WHERE id = _id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Public ingestion (extension): service-role only insert path via edge function.
-- Loosen insert policy to ALSO permit service_role direct inserts (already implicit), no change to authenticated path.
