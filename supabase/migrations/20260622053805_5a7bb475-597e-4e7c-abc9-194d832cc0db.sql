
CREATE TABLE IF NOT EXISTS public.admin_permissions (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  grant_admin_status boolean NOT NULL DEFAULT false,
  core_script_access boolean NOT NULL DEFAULT false,
  db_read           boolean NOT NULL DEFAULT true,
  db_modify         boolean NOT NULL DEFAULT false,
  promo_use         boolean NOT NULL DEFAULT true,
  promo_create      boolean NOT NULL DEFAULT false,
  promo_delete      boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

GRANT SELECT ON public.admin_permissions TO authenticated;
GRANT ALL ON public.admin_permissions TO service_role;

ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage all admin perms" ON public.admin_permissions;
CREATE POLICY "Owners manage all admin perms" ON public.admin_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'owner'));

DROP POLICY IF EXISTS "Admins read own perms" ON public.admin_permissions;
CREATE POLICY "Admins read own perms" ON public.admin_permissions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND public.has_role(auth.uid(),'admin'));

-- List admins (owner + admin can call)
CREATE OR REPLACE FUNCTION public.list_admins()
RETURNS TABLE(user_id uuid, email text, role app_role, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ur.user_id, p.email, ur.role, ur.created_at
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role IN ('admin','owner')
    AND (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  ORDER BY ur.role DESC, p.email;
$$;

-- Get permissions for an admin (creates default row if missing). Owner = any user. Admin = self only.
CREATE OR REPLACE FUNCTION public.get_admin_permissions(_user_id uuid)
RETURNS public.admin_permissions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _row public.admin_permissions;
BEGIN
  IF NOT (public.has_role(auth.uid(),'owner') OR (auth.uid() = _user_id AND public.has_role(auth.uid(),'admin'))) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  SELECT * INTO _row FROM public.admin_permissions WHERE user_id = _user_id;
  IF NOT FOUND THEN
    _row := ROW(_user_id, false, false, true, false, true, false, false, now(), NULL)::public.admin_permissions;
  END IF;
  RETURN _row;
END;
$$;

-- Set a single permission. Owner only. Cannot self-modify (owners are full power anyway).
CREATE OR REPLACE FUNCTION public.set_admin_permission(_user_id uuid, _key text, _value boolean)
RETURNS public.admin_permissions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _row public.admin_permissions;
BEGIN
  IF NOT public.has_role(auth.uid(),'owner') THEN
    RAISE EXCEPTION 'Owner only';
  END IF;
  IF _key NOT IN ('grant_admin_status','core_script_access','db_read','db_modify','promo_use','promo_create','promo_delete') THEN
    RAISE EXCEPTION 'Invalid permission key';
  END IF;
  IF public.has_role(_user_id,'owner') THEN
    RAISE EXCEPTION 'Owner permissions cannot be edited';
  END IF;

  INSERT INTO public.admin_permissions(user_id, updated_by, updated_at)
  VALUES (_user_id, auth.uid(), now())
  ON CONFLICT (user_id) DO NOTHING;

  EXECUTE format(
    'UPDATE public.admin_permissions SET %I = $1, updated_at = now(), updated_by = $2 WHERE user_id = $3 RETURNING *',
    _key
  ) INTO _row USING _value, auth.uid(), _user_id;

  RETURN _row;
END;
$$;
