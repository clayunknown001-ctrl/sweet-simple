
-- Allow users to view their own API keys
DROP POLICY IF EXISTS "Users can view their own api keys" ON public.api_keys;
CREATE POLICY "Users can view their own api keys"
ON public.api_keys
FOR SELECT
TO authenticated
USING (developer_id = auth.uid());

-- User-callable: generate a personal API key for the current user
CREATE OR REPLACE FUNCTION public.generate_my_api_key()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
  _token text;
  _masked text;
  _existing int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT email INTO _email FROM public.profiles WHERE id = auth.uid();
  IF _email IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Enforce a soft cap: max 3 active keys per user
  SELECT count(*) INTO _existing FROM public.api_keys
  WHERE developer_id = auth.uid() AND status = 'active';
  IF _existing >= 3 THEN
    RAISE EXCEPTION 'Maximum of 3 active API keys per account. Revoke an existing one first.';
  END IF;

  _token := 'sk_test_' || encode(gen_random_bytes(24), 'hex');
  _masked := substring(_token, 1, 12) || '...' || right(_token, 4);

  INSERT INTO public.api_keys(
    developer_id, developer_email, key_token, key_masked,
    tier, environment, monthly_quota
  ) VALUES (
    auth.uid(), _email, _token, _masked,
    'free_trial', 'staging', 50000
  );

  RETURN jsonb_build_object('success', true, 'token', _token, 'masked', _masked);
END;
$$;

-- User-callable: revoke (suspend) one of their own keys
CREATE OR REPLACE FUNCTION public.revoke_my_api_key(_key_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  UPDATE public.api_keys
  SET status = 'revoked', updated_at = now()
  WHERE id = _key_id AND developer_id = auth.uid();
  RETURN jsonb_build_object('success', true);
END;
$$;
