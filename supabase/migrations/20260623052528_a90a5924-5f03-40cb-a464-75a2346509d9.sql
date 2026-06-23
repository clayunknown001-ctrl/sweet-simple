
-- 1) Lock down SECURITY DEFINER function execution: revoke from PUBLIC + anon by default
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC', r.nspname, r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon', r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- 2) Internal-only function (trigger / auth callback) — also revoke from authenticated
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- 3) Re-grant EXECUTE to authenticated only where needed (client-callable RPCs + RLS helpers)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_flag(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role_by_email(text, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_system_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_api_key(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_flag_admin(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upgrade_my_api_key_tier(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reply_feedback(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_system_flag(text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_api_usage_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_api_key(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_my_api_key() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_admins() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_permission(uuid, text, boolean) TO authenticated;

-- 4) Stop publishing feedback changes via Realtime to prevent cross-user channel leakage
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'feedback'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.feedback';
  END IF;
END $$;
