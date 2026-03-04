-- Update handle_new_user trigger to create organization from farm_name metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_farm_name TEXT;
BEGIN
  v_farm_name := new.raw_user_meta_data ->> 'farm_name';

  -- Create organization if farm_name is provided
  IF v_farm_name IS NOT NULL AND v_farm_name != '' THEN
    INSERT INTO public.organizations (name)
    VALUES (v_farm_name)
    RETURNING id INTO v_org_id;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, organization_id)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(new.raw_user_meta_data ->> 'role', 'operario'),
    v_org_id
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;
