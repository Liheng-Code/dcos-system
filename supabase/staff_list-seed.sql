-- Staff List Seed Data
-- Password for all demo users: dcosdemo#2026
-- Run this AFTER the migration: 20260527000001_add_staff_fields.sql

do $$
declare
  rec record;
  uid uuid;
  l_role text;
begin
  for rec in (
    select * from (values
      ('C-0001', 'Liheng',        'Managing Director',         'management',    'L1', 'liheng@dcos.com',       null,       'male'),
      ('C-0002', 'Sophat',        'General Manager',           'management',    'L2', 'sophat@dcos.com',       'C-0001',   'male'),
      ('C-0003', 'Vuthy',         'Project Manager',           'management',    'L3', 'vuthy@dcos.com',        'C-0002',   'male'),
      ('C-0004', 'Chenda',        'Architect Manager',         'architecture',  'L4', 'chenda@dcos.com',       'C-0003',   'female'),
      ('C-0005', 'Pheara',        'Architectural Senior',      'architecture',  'L5', 'pheara@dcos.com',       'C-0004',   'female'),
      ('C-0006', 'Dany',          'Architectural Design-01',   'architecture',  'L6', 'dany@dcos.com',         'C-0005',   'male'),
      ('C-0007', 'Thida',         'Architectural Design-02',   'architecture',  'L6', 'thida@dcos.com',        'C-0005',   'female'),
      ('C-0008', 'Tangkea',       'Structure Manager',         'structural',    'L4', 'tangkea@dcos.com',      'C-0003',   'male'),
      ('C-0009', 'Dara',          'Structure Senior',          'structural',    'L5', 'dara@dcos.com',         'C-0008',   'male'),
      ('C-0010', 'The',           'Structure Design-01',       'structural',    'L6', 'the@dcos.com',          'C-0009',   'male'),
      ('C-0011', 'Kosal',         'Structure Design-02',       'structural',    'L6', 'kosal@dcos.com',        'C-0009',   'male'),
      ('C-0012', 'Visal',         'Procurement Manager',       'procurement',   'L4', 'visal@dcos.com',        'C-0003',   'male'),
      ('C-0013', 'Anna',          'Procurement Senior',        'procurement',   'L5', 'anna@dcos.com',         'C-0012',   'female'),
      ('C-0014', 'Daros',         'Procurement-01',            'procurement',   'L6', 'daros@dcos.com',        'C-0013',   'male'),
      ('C-0015', 'Sovvan',        'Procurement-02',            'procurement',   'L6', 'sovvan@dcos.com',       'C-0013',   'male'),
      ('C-0016', 'Sophal',        'Construction Manager',      'construction',  'L4', 'sophal@dcos.com',       'C-0003',   'female'),
      ('C-0017', 'Ratanak',       'Construction Senior',       'construction',  'L5', 'ratanak@dcos.com',      'C-0016',   'male'),
      ('C-0018', 'Sokun',         'Site Engineer - Architect', 'construction',  'L6', 'sokun@dcos.com',        'C-0017',   'male'),
      ('C-0019', 'Vannara',       'Site Engineer - C&S',       'construction',  'L6', 'vannara@dcos.com',      'C-0017',   'male'),
      ('C-0020', 'Bophea',        'Site Engineer - MEP',       'construction',  'L6', 'bophea@dcos.com',       'C-0017',   'female'),
      ('C-0021', 'Kimseng',       'HR Manager',                'hr',            'L4', 'kimseng@dcos.com',      'C-0002',   'male'),
      ('C-0022', 'Pepsi',         'HR Senior',                 'hr',            'L5', 'pepsi@dcos.com',        'C-0021',   'female'),
      ('C-0023', 'Nalin',         'HR-01',                     'hr',            'L6', 'nalin@dcos.com',        'C-0022',   'female'),
      ('C-0024', 'Kimly',         'HR-02',                     'hr',            'L6', 'kimly@dcos.com',        'C-0022',   'female'),
      ('C-0025', 'Sovanarith',    'Account Manager',           'accounting',    'L4', 'sovanarith@dcos.com',   'C-0002',   'male'),
      ('C-0026', 'Sreymom',       'Account Senior',            'accounting',    'L5', 'sreymom@dcos.com',      'C-0025',   'female'),
      ('C-0027', 'Rithy',         'Account',                   'accounting',    'L6', 'rithy@dcos.com',        'C-0025',   'male'),
      ('C-0028', 'Hanko',         'MEP Manager',               'mep',           'L4', 'hanko@dcos.com',        'C-0003',   'male'),
      ('C-0029', 'Seyha',         'MEP Senior',                'mep',           'L5', 'seyha@dcos.com',        'C-0028',   'male'),
      ('C-0030', 'Samnang',       'MEP Design',                'mep',           'L6', 'samnang@dcos.com',      'C-0029',   'male'),
      ('C-0031', 'Sophea',        'MEP Design',                'mep',           'L6', 'sophea@dcos.com',       'C-0029',   'female'),
      ('C-0032', 'Nita',          'MEP Design',                'mep',           'L6', 'nita@dcos.com',         'C-0029',   'female'),
      ('C-0033', 'Vanchhouy',     'MEP Design',                'mep',           'L6', 'vanchhouy@dcos.com',    'C-0029',   'female'),
      ('C-0034', 'nisa',          'Accountant',                'accounting',    'L6', 'nisa@dcos.com',         'C-0025',   'female'),
      ('C0035',  'Soklay',        'Architectural',             'architecture',  'L6', 'soklay@dcos.com',       'C-0004',   'female')
    ) as t(employee_id, full_name, job_title, department, level, email, report_to, gender)
  ) loop
    if not exists (select 1 from auth.users where email = rec.email) then
      uid := gen_random_uuid();

      l_role := case
        when rec.level in ('L1', 'L2') then 'admin'
        when rec.level = 'L3' then 'project_manager'
        when rec.level = 'L4' then 'department_manager'
        else 'viewer'
      end;

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token,
        email_change, email_change_token_new, recovery_token
      ) values (
        '00000000-0000-0000-0000-000000000000',
        uid,
        'authenticated',
        'authenticated',
        rec.email,
        crypt('dcosdemo#2026', gen_salt('bf', 10)),
        now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('full_name', rec.full_name),
        now(),
        now(),
        '',
        '',
        '',
        ''
      );

      -- The trigger on_auth_user_created auto-creates a profile row.
      -- Update it with the additional fields.
      update public.profiles
        set full_name   = rec.full_name,
            email       = rec.email,
            employee_id = rec.employee_id,
            job_title   = rec.job_title,
            department  = rec.department,
            level       = rec.level,
            report_to   = rec.report_to,
            role        = l_role,
            gender      = rec.gender
        where id = uid;
    end if;

    -- Assign user_roles (level-based role + functional role for specific depts)
    insert into public.user_roles (user_id, role_code) values
      (uid, rec.level)
    on conflict do nothing;

    if rec.department in ('hr') then
      insert into public.user_roles (user_id, role_code) values (uid, 'HR') on conflict do nothing;
    end if;
    if rec.department in ('accounting') then
      insert into public.user_roles (user_id, role_code) values (uid, 'AC') on conflict do nothing;
    end if;
    if rec.department in ('procurement') then
      insert into public.user_roles (user_id, role_code) values (uid, 'PO') on conflict do nothing;
    end if;
    if rec.job_title ilike '%accountant%' and rec.department != 'accounting' then
      insert into public.user_roles (user_id, role_code) values (uid, 'AC') on conflict do nothing;
    end if;
  end loop;
end;
$$;
