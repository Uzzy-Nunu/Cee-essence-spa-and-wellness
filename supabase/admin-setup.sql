-- ============================================================
-- CEE ESSENCE SPA & WELLNESS — ADMIN USER SETUP SCRIPT
-- Run this in the Supabase SQL Editor (supabase.com/dashboard -> SQL Editor)
-- ============================================================

-- 1. Ensure the admin_users table and RLS policy exist
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'super_admin')),
  created_at timestamp with time zone default now()
);

alter table admin_users
  add column if not exists role text not null default 'admin';
alter table admin_users
  drop constraint if exists admin_users_role_check;
alter table admin_users
  add constraint admin_users_role_check check (role in ('admin', 'super_admin'));

alter table admin_users enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies 
    where tablename = 'admin_users' and policyname = 'Users can read their own admin row'
  ) then
    create policy "Users can read their own admin row"
    on admin_users
    for select
    to authenticated
    using (auth.uid() = user_id);
  end if;
end $$;

-- 2. Grant admin access to your email (vickiegeorge2015@gmail.com)
-- Note: Make sure you have signed up / created a user in Supabase Authentication -> Users first!
insert into admin_users (user_id)
select id from auth.users
where lower(email) = lower('vickiegeorge2015@gmail.com')
on conflict (user_id) do nothing;

update admin_users
set role = 'super_admin'
from auth.users
where admin_users.user_id = auth.users.id
  and lower(auth.users.email) = lower('vickiegeorge2015@gmail.com');

-- Verify admin status
select 
  u.id as user_id,
  u.email,
  case when a.id is not null then 'Authorized Admin' else 'Not Admin' end as status
from auth.users u
left join admin_users a on u.id = a.user_id
where lower(u.email) = lower('vickiegeorge2015@gmail.com');
