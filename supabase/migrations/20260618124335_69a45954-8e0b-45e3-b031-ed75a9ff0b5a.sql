
-- 1) Tighten feedback INSERT: require auth.uid() = user_id AND email matches profile
DROP POLICY IF EXISTS "Users insert own feedback" ON public.feedback;
CREATE POLICY "Users insert own feedback"
ON public.feedback
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.email = feedback.user_email
  )
);

-- 2) Revoke EXECUTE from anon on SECURITY DEFINER functions (no unauth need)
REVOKE EXECUTE ON FUNCTION public.set_user_role_by_email(text, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_system_analytics() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.generate_api_key(text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.generate_my_api_key() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.revoke_my_api_key(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_system_flag(text, boolean, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.grant_flag_admin(text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_api_usage_analytics() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_manage_flag(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
