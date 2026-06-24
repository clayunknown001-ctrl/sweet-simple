-- Revoke EXECUTE from public roles on SECURITY DEFINER helper/trigger functions
-- that should NOT be callable by signed-in users via the API.

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_flag(text) FROM PUBLIC, anon, authenticated;

-- has_role still needs to be executable by authenticated because some RPC paths
-- and client code reference it. Keep it granted to authenticated.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
