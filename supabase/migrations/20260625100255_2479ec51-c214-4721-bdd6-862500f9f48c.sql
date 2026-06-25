-- Lock down upgrade_my_api_key_tier: remove direct authenticated access and
-- require a verified Stripe subscription identifier to perform the upgrade.

REVOKE EXECUTE ON FUNCTION public.upgrade_my_api_key_tier(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upgrade_my_api_key_tier(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upgrade_my_api_key_tier(uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upgrade_my_api_key_tier(uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.upgrade_my_api_key_tier(
  _key_id uuid,
  _tier text,
  _stripe_customer_id text DEFAULT NULL::text,
  _stripe_subscription_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _quota int;
  _pay text;
  _caller_role text;
BEGIN
  -- Only the service role (Stripe webhook handler) may call this directly.
  -- Signed-in users must go through Stripe Checkout; the webhook then invokes
  -- this function with a verified subscription id.
  _caller_role := current_setting('request.jwt.claim.role', true);
  IF _caller_role IS DISTINCT FROM 'service_role' AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied: tier upgrades require a verified Stripe webhook';
  END IF;

  IF _tier NOT IN ('free_trial','pro_monthly','pay_as_you_go') THEN
    RAISE EXCEPTION 'Invalid tier';
  END IF;

  -- Require a real Stripe subscription id for paid tiers.
  IF _tier IN ('pro_monthly','pay_as_you_go')
     AND (_stripe_subscription_id IS NULL OR length(trim(_stripe_subscription_id)) = 0) THEN
    RAISE EXCEPTION 'Stripe subscription id required for paid tier upgrades';
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
   WHERE id = _key_id;

  RETURN jsonb_build_object('success', true, 'tier', _tier, 'token_quota', _quota);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.upgrade_my_api_key_tier(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upgrade_my_api_key_tier(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upgrade_my_api_key_tier(uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upgrade_my_api_key_tier(uuid, text, text, text) TO service_role;