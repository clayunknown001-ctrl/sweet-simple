
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.generate_my_api_key()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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

  SELECT count(*) INTO _existing FROM public.api_keys
  WHERE developer_id = auth.uid() AND status = 'active';
  IF _existing >= 3 THEN
    RAISE EXCEPTION 'Maximum of 3 active API keys per account. Revoke an existing one first.';
  END IF;

  _token := 'sk_test_' || encode(extensions.gen_random_bytes(24), 'hex');
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
$function$;

CREATE OR REPLACE FUNCTION public.generate_api_key(_developer_email text, _tier text DEFAULT 'free_trial'::text, _environment text DEFAULT 'staging'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _token text;
  _masked text;
  _quota int;
  _dev_id uuid;
  _prefix text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  _prefix := CASE WHEN _environment = 'production' THEN 'sk_live_' ELSE 'sk_test_' END;
  _token := _prefix || encode(extensions.gen_random_bytes(24), 'hex');
  _masked := substring(_token, 1, 12) || '...' || right(_token, 4);
  _quota := CASE _tier
    WHEN 'enterprise' THEN 1000000
    WHEN 'developer_pro' THEN 250000
    ELSE 50000 END;

  SELECT id INTO _dev_id FROM public.profiles WHERE email = _developer_email LIMIT 1;

  INSERT INTO public.api_keys(developer_id, developer_email, key_token, key_masked, tier, environment, monthly_quota)
  VALUES (_dev_id, _developer_email, _token, _masked, _tier, _environment, _quota);

  RETURN jsonb_build_object('success', true, 'token', _token, 'masked', _masked);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.generate_my_api_key() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.generate_api_key(text, text, text) FROM anon, public;
