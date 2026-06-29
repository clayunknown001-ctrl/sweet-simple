CREATE OR REPLACE FUNCTION public.ensure_my_role()
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text := lower(coalesce((auth.jwt() ->> 'email'), ''));
  _role public.app_role;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'user'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF _email = 'clayunknown001@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_uid, 'owner'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'owner'::public.app_role) THEN 'owner'::public.app_role
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'admin'::public.app_role) THEN 'admin'::public.app_role
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'premium'::public.app_role) THEN 'premium'::public.app_role
    ELSE 'user'::public.app_role
  END INTO _role;

  RETURN _role;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_my_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL::public.app_role
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'owner'::public.app_role) THEN 'owner'::public.app_role
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::public.app_role) THEN 'admin'::public.app_role
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'premium'::public.app_role) THEN 'premium'::public.app_role
    ELSE 'user'::public.app_role
  END
$$;

REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- Repair the current owner account immediately if it exists.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner'::public.app_role
FROM auth.users
WHERE lower(email) = 'clayunknown001@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;