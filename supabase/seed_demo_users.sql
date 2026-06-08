DO $$
DECLARE
  users_data jsonb := '[
    {"email": "liheng@dcos.com", "name": "Liheng", "role": "admin"},
    {"email": "sophat@dcos.com", "name": "Sophat", "role": "admin"},
    {"email": "vuthy@dcos.com", "name": "Vuthy", "role": "project_manager"},
    {"email": "chenda@dcos.com", "name": "Chenda", "role": "project_manager"},
    {"email": "pheara@dcos.com", "name": "Pheara", "role": "project_manager"},
    {"email": "dany@dcos.com", "name": "Dany", "role": "viewer"},
    {"email": "thida@dcos.com", "name": "Thida", "role": "viewer"},
    {"email": "tangkea@dcos.com", "name": "Tangkea", "role": "project_manager"},
    {"email": "dara@dcos.com", "name": "Dara", "role": "viewer"},
    {"email": "the@dcos.com", "name": "The", "role": "viewer"},
    {"email": "kosal@dcos.com", "name": "Kosal", "role": "viewer"},
    {"email": "visal@dcos.com", "name": "Visal", "role": "project_manager"},
    {"email": "anna@dcos.com", "name": "Anna", "role": "viewer"},
    {"email": "daros@dcos.com", "name": "Daros", "role": "viewer"},
    {"email": "sovvan@dcos.com", "name": "Sovvan", "role": "viewer"},
    {"email": "sophal@dcos.com", "name": "Sophal", "role": "project_manager"},
    {"email": "ratanak@dcos.com", "name": "Ratanak", "role": "viewer"},
    {"email": "sokun@dcos.com", "name": "Sokun", "role": "viewer"},
    {"email": "vannara@dcos.com", "name": "Vannara", "role": "viewer"},
    {"email": "bophea@dcos.com", "name": "Bophea", "role": "viewer"},
    {"email": "kimseng@dcos.com", "name": "Kimseng", "role": "viewer"},
    {"email": "pepsi@dcos.com", "name": "Pepsi", "role": "viewer"},
    {"email": "nalin@dcos.com", "name": "Nalin", "role": "viewer"},
    {"email": "kimly@dcos.com", "name": "Kimly", "role": "viewer"},
    {"email": "sovanarith@dcos.com", "name": "Sovanarith", "role": "viewer"},
    {"email": "sreymom@dcos.com", "name": "Sreymom", "role": "viewer"},
    {"email": "rithy@dcos.com", "name": "Rithy", "role": "viewer"},
    {"email": "hanko@dcos.com", "name": "Hanko", "role": "project_manager"},
    {"email": "seyha@dcos.com", "name": "Seyha", "role": "viewer"},
    {"email": "samnang@dcos.com", "name": "Samnang", "role": "viewer"},
    {"email": "sophea@dcos.com", "name": "Sophea", "role": "viewer"},
    {"email": "nita@dcos.com", "name": "Nita", "role": "viewer"},
    {"email": "vanchhouy@dcos.com", "name": "Vanchhouy", "role": "viewer"},
    {"email": "sarach@dcos.com", "name": "Sarach", "role": "viewer"},
    {"email": "lyheang@dcos.com", "name": "Lyheang", "role": "viewer"}
  ]';
  u jsonb;
  uid uuid;
  admin_emails text[] := ARRAY['liheng@dcos.com', 'sophat@dcos.com'];
  pm_emails text[] := ARRAY['vuthy@dcos.com', 'chenda@dcos.com', 'pheara@dcos.com', 'tangkea@dcos.com', 'visal@dcos.com', 'sophal@dcos.com', 'hanko@dcos.com'];
BEGIN
  FOR u IN SELECT * FROM jsonb_array_elements(users_data)
  LOOP
    uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token,
      email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      uid, 'authenticated', 'authenticated', u->>'email',
      crypt('dcosdemo#2026', gen_salt('bf')), now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('full_name', u->>'name'),
      now(), now(), '', '', '', ''
    );
    -- Trigger creates profile, update role
    IF u->>'email' = ANY(admin_emails) THEN
      UPDATE public.profiles SET role = 'admin' WHERE id = uid;
    ELSIF u->>'email' = ANY(pm_emails) THEN
      UPDATE public.profiles SET role = 'project_manager' WHERE id = uid;
    END IF;
  END LOOP;
END;
$$;
