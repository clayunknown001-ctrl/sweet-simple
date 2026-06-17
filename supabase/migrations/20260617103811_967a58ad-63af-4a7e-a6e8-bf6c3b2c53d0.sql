
-- API KEYS TABLE
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  developer_email text NOT NULL,
  key_token text NOT NULL UNIQUE,
  key_masked text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  monthly_quota int NOT NULL DEFAULT 50000,
  requests_used int NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'free_trial' CHECK (tier IN ('free_trial','developer_pro','enterprise')),
  environment text NOT NULL DEFAULT 'staging' CHECK (environment IN ('staging','production')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage api keys"
ON public.api_keys FOR ALL
TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

-- SYSTEM FLAGS TABLE
CREATE TABLE public.system_flags (
  id serial PRIMARY KEY,
  flag_name text NOT NULL UNIQUE,
  staging_value boolean NOT NULL DEFAULT false,
  production_value boolean NOT NULL DEFAULT false,
  allowed_admin_emails text[] NOT NULL DEFAULT '{}',
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_flags TO authenticated;
GRANT ALL ON public.system_flags TO service_role;
ALTER TABLE public.system_flags ENABLE ROW LEVEL SECURITY;

-- helper: is user an authorized flag admin (owner OR admin whose email is in allowed list)
CREATE OR REPLACE FUNCTION public.can_manage_flag(_flag_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(),'owner')
    OR (
      public.has_role(auth.uid(),'admin')
      AND EXISTS (
        SELECT 1 FROM public.system_flags f
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE f.flag_name = _flag_name
          AND p.email = ANY(f.allowed_admin_emails)
      )
    )
$$;

CREATE POLICY "Owners and listed admins view flags"
ON public.system_flags FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(),'owner')
  OR (public.has_role(auth.uid(),'admin') AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.email = ANY(allowed_admin_emails)
  ))
);

CREATE POLICY "Owners insert flags"
ON public.system_flags FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(),'owner'));

CREATE POLICY "Authorized admins update flags"
ON public.system_flags FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(),'owner')
  OR (public.has_role(auth.uid(),'admin') AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.email = ANY(allowed_admin_emails)
  ))
);

CREATE POLICY "Owners delete flags"
ON public.system_flags FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(),'owner'));

-- seed core flag
INSERT INTO public.system_flags (flag_name, staging_value, production_value, description)
VALUES ('enable_local_ai_inference', true, true, 'When true: monitor.js runs Local/Edge Client Mode (Transformers.js). When false: API Hybrid Mode.')
ON CONFLICT (flag_name) DO NOTHING;

-- RPC: generate api key (admins/owners)
CREATE OR REPLACE FUNCTION public.generate_api_key(_developer_email text, _tier text DEFAULT 'free_trial', _environment text DEFAULT 'staging')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
  _token := _prefix || encode(gen_random_bytes(24), 'hex');
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
$$;

-- RPC: toggle system flag (staging-first; production requires owner)
CREATE OR REPLACE FUNCTION public.set_system_flag(_flag_name text, _value boolean, _channel text DEFAULT 'staging')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_flag(_flag_name) THEN
    RAISE EXCEPTION 'Access denied for flag %', _flag_name;
  END IF;
  IF _channel = 'production' AND NOT public.has_role(auth.uid(),'owner') THEN
    RAISE EXCEPTION 'Only owner can write to production channel';
  END IF;
  IF _channel = 'staging' THEN
    UPDATE public.system_flags SET staging_value = _value, updated_at = now() WHERE flag_name = _flag_name;
  ELSE
    UPDATE public.system_flags SET production_value = _value, updated_at = now() WHERE flag_name = _flag_name;
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- RPC: owner grants admin email access to a flag
CREATE OR REPLACE FUNCTION public.grant_flag_admin(_flag_name text, _email text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'owner') THEN
    RAISE EXCEPTION 'Owner only';
  END IF;
  UPDATE public.system_flags
  SET allowed_admin_emails = (SELECT ARRAY(SELECT DISTINCT unnest(allowed_admin_emails || ARRAY[_email]))),
      updated_at = now()
  WHERE flag_name = _flag_name;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- RPC: mock analytics for charts
CREATE OR REPLACE FUNCTION public.get_api_usage_analytics()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _series jsonb := '[]'::jsonb;
  _i int;
  _base int;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  SELECT COALESCE(SUM(requests_used),0)::int INTO _base FROM public.api_keys;
  FOR _i IN 0..29 LOOP
    _series := _series || jsonb_build_array(jsonb_build_object(
      'day', to_char((now() - ((29 - _i) || ' days')::interval)::date, 'MM-DD'),
      'requests', GREATEST(0, (_base/30) + ((random()*1000)::int) - 200)
    ));
  END LOOP;
  RETURN jsonb_build_object('series', _series);
END;
$$;
