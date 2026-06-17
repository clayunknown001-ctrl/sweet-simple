
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_user_role_by_email(TEXT, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_system_analytics() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role_by_email(TEXT, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_system_analytics() TO authenticated;
