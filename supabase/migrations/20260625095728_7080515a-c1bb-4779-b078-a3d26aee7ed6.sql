-- Tighten EXECUTE on SECURITY DEFINER functions: revoke from PUBLIC and anon.
-- Functions retain EXECUTE for authenticated where called via RPC from the app;
-- each function performs its own internal role/ownership checks.

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'has_role(uuid, app_role)',
    'handle_new_user()',
    'set_user_role_by_email(text, app_role)',
    'can_manage_flag(text)',
    'delete_my_api_key(uuid)',
    'get_system_analytics()',
    'grant_flag_admin(text, text)',
    'upgrade_my_api_key_tier(uuid, text, text, text)',
    'get_admin_permissions(uuid)',
    'get_api_usage_analytics()',
    'reply_feedback(uuid, text, text)',
    'list_admins()',
    'set_admin_permission(uuid, text, boolean)',
    'generate_my_api_key()',
    'set_system_flag(text, boolean, text)',
    'generate_api_key(text, text, text)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', fn);
  END LOOP;
END $$;

-- Revoke authenticated EXECUTE on functions that should never be called directly
-- by signed-in users via the Data API. These are either trigger-only or
-- admin/owner-only helpers that the app does not need to invoke as a generic
-- authenticated user, or are invoked by RLS policies (which run as the
-- definer and do not require the invoker to hold EXECUTE).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.can_manage_flag(text) FROM authenticated;

-- Re-grant EXECUTE explicitly to authenticated for the RPC-exposed functions
-- so the application continues to work. Each function enforces its own
-- ownership/role checks internally.
GRANT EXECUTE ON FUNCTION public.delete_my_api_key(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_my_api_key() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upgrade_my_api_key_tier(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_system_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_api_usage_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_admins() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reply_feedback(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_permission(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_system_flag(text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role_by_email(text, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_flag_admin(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_api_key(text, text, text) TO authenticated;

-- service_role retains full access
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_flag(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;