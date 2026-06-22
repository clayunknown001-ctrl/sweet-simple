-- Role enum
CREATE TYPE public.app_role AS ENUM ('user', 'admin', 'owner');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Feedback
CREATE TABLE public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- API KEYS TABLE
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  developer_email text NOT NULL,
  key_token text NOT NULL UNIQUE,
  key_masked text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked','deleted')),
  monthly_quota int NOT NULL DEFAULT 0,
  requests_used int NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'free_trial' CHECK (tier IN ('free_trial','pro_monthly','pay_as_you_go','developer_pro','enterprise')),
  environment text NOT NULL DEFAULT 'staging' CHECK (environment IN ('staging','production')),
  token_quota INT NOT NULL DEFAULT 5000,
  tokens_used INT NOT NULL DEFAULT 0,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'none' CHECK (payment_status IN ('none','active','past_due','canceled','trialing')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

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

-- Security definer role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Profile policies
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- user_roles policies
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

-- Feedback policies
CREATE POLICY "Users insert own feedback" ON public.feedback
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.email = feedback.user_email
    )
  );
CREATE POLICY "Users view own feedback" ON public.feedback
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all feedback" ON public.feedback
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

-- API keys policies
CREATE POLICY "Admins manage api keys"
ON public.api_keys FOR ALL
TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE POLICY "Users can view their own api keys"
ON public.api_keys
FOR SELECT
TO authenticated
USING (developer_id = auth.uid());

-- System flags policies
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

-- Trigger to create profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  is_first BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') INTO is_first;

  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Owner-only role mutation by email
CREATE OR REPLACE FUNCTION public.set_user_role_by_email(_email TEXT, _role app_role)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _target UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION 'Only owners can modify roles';
  END IF;

  SELECT id INTO _target FROM public.profiles WHERE email = _email;
  IF _target IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', _email;
  END IF;

  IF public.has_role(_target, 'owner') THEN
    RAISE EXCEPTION 'Cannot modify an owner account';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target AND role IN ('user','admin');
  INSERT INTO public.user_roles (user_id, role) VALUES (_target, _role);

  RETURN jsonb_build_object('success', true, 'user_id', _target, 'role', _role);
END;
$$;

-- Analytics RPC (admin/owner only)
CREATE OR REPLACE FUNCTION public.get_system_analytics()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _total_users INT;
  _db_size BIGINT;
  _monthly_revenue NUMERIC;
  _all_time_profit NUMERIC;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT count(*) INTO _total_users FROM public.profiles;
  SELECT pg_database_size(current_database()) INTO _db_size;

  _monthly_revenue := COALESCE(_total_users, 0) * 19.99;
  _all_time_profit := COALESCE(_total_users, 0) * 142.5;

  RETURN jsonb_build_object(
    'total_users_count', _total_users,
    'monthly_revenue', _monthly_revenue,
    'all_time_profit', _all_time_profit,
    'db_storage_used_bytes', _db_size,
    'db_storage_limit_bytes', 524288500
  );
END;
$$;

-- RPC: generate api key (admins/owners)
CREATE OR REPLACE FUNCTION public.generate_api_key(_developer_email text, _tier text DEFAULT 'free_trial', _environment text DEFAULT 'staging')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
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

-- User-callable: generate a personal API key for the current user
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
    tier, environment, monthly_quota, token_quota, tokens_used, payment_status
  ) VALUES (
    auth.uid(), _email, _token, _masked,
    'free_trial', 'staging', 0, 5000, 0, 'none'
  );

  RETURN jsonb_build_object('success', true, 'token', _token, 'masked', _masked);
END;
$function$;

-- User-callable: hard-delete own key
CREATE OR REPLACE FUNCTION public.delete_my_api_key(_key_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  DELETE FROM public.api_keys
   WHERE id = _key_id AND developer_id = auth.uid();
  RETURN jsonb_build_object('success', true);
END;
$function$;

-- Upgrade tier RPC (sets tier + token quota + payment status)
CREATE OR REPLACE FUNCTION public.upgrade_my_api_key_tier(
  _key_id uuid,
  _tier text,
  _stripe_customer_id text DEFAULT NULL,
  _stripe_subscription_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _quota int;
  _pay text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _tier NOT IN ('free_trial','pro_monthly','pay_as_you_go') THEN
    RAISE EXCEPTION 'Invalid tier';
  END IF;

  _quota := CASE _tier
    WHEN 'pro_monthly' THEN 2000000
    WHEN 'pay_as_you_go' THEN 0
    ELSE 5000
  END;
  _pay := CASE WHEN _tier = 'free_trial' THEN 'none' ELSE 'active' END;

  UPDATE public.api_keys
     SET tier = _tier,
         token_quota = _quota,
         tokens_used = 0,
         stripe_customer_id = COALESCE(_stripe_customer_id, stripe_customer_id),
         stripe_subscription_id = COALESCE(_stripe_subscription_id, stripe_subscription_id),
         payment_status = _pay,
         updated_at = now()
   WHERE id = _key_id AND developer_id = auth.uid();

  RETURN jsonb_build_object('success', true, 'tier', _tier, 'token_quota', _quota);
END;
$function$;

-- Function grants
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_user_role_by_email(TEXT, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_system_analytics() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_api_key(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_my_api_key() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_my_api_key(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_system_flag(text, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.grant_flag_admin(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_api_usage_analytics() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_flag(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role_by_email(TEXT, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_system_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_my_api_key() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_api_key(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upgrade_my_api_key_tier(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_system_flag(text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_flag_admin(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_api_usage_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_api_key(text, text, text) TO authenticated;