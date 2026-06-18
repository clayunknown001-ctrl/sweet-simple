
-- 1. Drop old restrictive constraints
ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_status_check;
ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_tier_check;

-- 2. Add new permissive constraints
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_status_check
  CHECK (status IN ('active','suspended','revoked','deleted'));
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_tier_check
  CHECK (tier IN ('free_trial','pro_monthly','pay_as_you_go','developer_pro','enterprise'));

-- 3. Add token + billing columns
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS token_quota INT NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS tokens_used INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'none'
    CHECK (payment_status IN ('none','active','past_due','canceled','trialing'));

-- 4. Update generate_my_api_key for token-based free trial (5000 tokens)
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

REVOKE EXECUTE ON FUNCTION public.generate_my_api_key() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.generate_my_api_key() TO authenticated;

-- 5. Hard-delete RPC for users
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

REVOKE EXECUTE ON FUNCTION public.delete_my_api_key(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_my_api_key(uuid) TO authenticated;

-- 6. Upgrade tier RPC (sets tier + token quota + payment status)
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
    WHEN 'pro_monthly' THEN 2000000     -- 2M premium tokens / month
    WHEN 'pay_as_you_go' THEN 0          -- unlimited / metered
    ELSE 5000                             -- free_trial
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

REVOKE EXECUTE ON FUNCTION public.upgrade_my_api_key_tier(uuid,text,text,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.upgrade_my_api_key_tier(uuid,text,text,text) TO authenticated;
