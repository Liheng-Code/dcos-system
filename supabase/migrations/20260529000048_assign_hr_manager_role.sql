-- Ensure staff with the HR Manager job title receive the functional HR_Manager role.
INSERT INTO public.user_roles (user_id, role_code)
SELECT id, 'HR_Manager'
FROM public.profiles
WHERE job_title ILIKE '%HR Manager%'
ON CONFLICT DO NOTHING;
