begin;

alter table admin_users
  add column if not exists role text not null default 'admin';
alter table admin_users
  drop constraint if exists admin_users_role_check;
alter table admin_users
  add constraint admin_users_role_check check (role in ('admin', 'super_admin'));

insert into admin_users (user_id, role)
select id, 'super_admin'
from auth.users
where lower(email) = lower('vickiegeorge2015@gmail.com')
on conflict (user_id) do update
set role = excluded.role;

create unique index if not exists appointments_paystack_reference_unique_idx
on appointments (paystack_reference)
where paystack_reference is not null;

create or replace function prevent_last_super_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_super_admins integer;
begin
  if old.role = 'super_admin'
    and (tg_op = 'DELETE' or new.role is distinct from 'super_admin') then
    perform pg_advisory_xact_lock(hashtext('admin_users_super_admin_guard'));
    select count(*) into remaining_super_admins
    from admin_users
    where role = 'super_admin' and id <> old.id;
    if remaining_super_admins = 0 then
      raise exception 'Cannot remove or demote the last Super Admin.';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_last_super_admin_removal on admin_users;
create trigger prevent_last_super_admin_removal
before update of role or delete on admin_users
for each row execute function prevent_last_super_admin_removal();

drop policy if exists "Anyone can read active services" on services;
drop policy if exists "Admins can manage services" on services;
drop policy if exists "Public and staff can read services" on services;
drop policy if exists "Super admins can manage services" on services;
create policy "Public and staff can read services"
on services for select to anon, authenticated
using (
  is_active
  or exists (select 1 from admin_users where user_id = auth.uid())
);
create policy "Super admins can manage services"
on services for all to authenticated
using (exists (select 1 from admin_users where user_id = auth.uid() and role = 'super_admin'))
with check (exists (select 1 from admin_users where user_id = auth.uid() and role = 'super_admin'));

drop policy if exists "Anyone can create appointments" on appointments;
drop policy if exists "Admins can read appointments" on appointments;
drop policy if exists "Admins can update appointments" on appointments;
drop policy if exists "Staff can read appointments" on appointments;
drop policy if exists "Super admins can update appointments" on appointments;
create policy "Staff can read appointments"
on appointments for select to authenticated
using (exists (select 1 from admin_users where user_id = auth.uid()));
create policy "Super admins can update appointments"
on appointments for update to authenticated
using (exists (select 1 from admin_users where user_id = auth.uid() and role = 'super_admin'))
with check (exists (select 1 from admin_users where user_id = auth.uid() and role = 'super_admin'));

drop policy if exists "Anyone can read business hours" on business_hours;
drop policy if exists "Admins can manage business hours" on business_hours;
drop policy if exists "Super admins can manage business hours" on business_hours;
create policy "Anyone can read business hours"
on business_hours for select to anon, authenticated using (true);
create policy "Super admins can manage business hours"
on business_hours for all to authenticated
using (exists (select 1 from admin_users where user_id = auth.uid() and role = 'super_admin'))
with check (exists (select 1 from admin_users where user_id = auth.uid() and role = 'super_admin'));

drop policy if exists "Anyone can read blocked dates" on blocked_dates;
drop policy if exists "Admins can manage blocked dates" on blocked_dates;
drop policy if exists "Super admins can manage blocked dates" on blocked_dates;
create policy "Anyone can read blocked dates"
on blocked_dates for select to anon, authenticated using (true);
create policy "Super admins can manage blocked dates"
on blocked_dates for all to authenticated
using (exists (select 1 from admin_users where user_id = auth.uid() and role = 'super_admin'))
with check (exists (select 1 from admin_users where user_id = auth.uid() and role = 'super_admin'));

drop policy if exists "Anyone can read spa settings" on spa_settings;
drop policy if exists "Admins can manage spa settings" on spa_settings;
drop policy if exists "Super admins can manage spa settings" on spa_settings;
create policy "Anyone can read spa settings"
on spa_settings for select to anon, authenticated using (true);
create policy "Super admins can manage spa settings"
on spa_settings for all to authenticated
using (exists (select 1 from admin_users where user_id = auth.uid() and role = 'super_admin'))
with check (exists (select 1 from admin_users where user_id = auth.uid() and role = 'super_admin'));

drop policy if exists "Anyone can read active therapists" on therapists;
drop policy if exists "Admins can manage therapists" on therapists;
drop policy if exists "Public and staff can read therapists" on therapists;
drop policy if exists "Super admins can manage therapists" on therapists;
create policy "Public and staff can read therapists"
on therapists for select to anon, authenticated
using (
  is_active
  or exists (select 1 from admin_users where user_id = auth.uid())
);
create policy "Super admins can manage therapists"
on therapists for all to authenticated
using (exists (select 1 from admin_users where user_id = auth.uid() and role = 'super_admin'))
with check (exists (select 1 from admin_users where user_id = auth.uid() and role = 'super_admin'));

drop policy if exists "Anyone can read therapist-service mapping" on therapist_services;
drop policy if exists "Admins can manage therapist-service mapping" on therapist_services;
drop policy if exists "Super admins can manage therapist-service mapping" on therapist_services;
create policy "Anyone can read therapist-service mapping"
on therapist_services for select to anon, authenticated using (true);
create policy "Super admins can manage therapist-service mapping"
on therapist_services for all to authenticated
using (exists (select 1 from admin_users where user_id = auth.uid() and role = 'super_admin'))
with check (exists (select 1 from admin_users where user_id = auth.uid() and role = 'super_admin'));

drop policy if exists "Admins can manage therapist time off" on therapist_time_off;
drop policy if exists "Staff can read therapist time off" on therapist_time_off;
drop policy if exists "Super admins can manage therapist time off" on therapist_time_off;
create policy "Staff can read therapist time off"
on therapist_time_off for select to authenticated
using (exists (select 1 from admin_users where user_id = auth.uid()));
create policy "Super admins can manage therapist time off"
on therapist_time_off for all to authenticated
using (exists (select 1 from admin_users where user_id = auth.uid() and role = 'super_admin'))
with check (exists (select 1 from admin_users where user_id = auth.uid() and role = 'super_admin'));

drop policy if exists "Anyone can create a support ticket" on support_tickets;
drop policy if exists "Admins can read support tickets" on support_tickets;
drop policy if exists "Admins can update support tickets" on support_tickets;
drop policy if exists "Staff can read support tickets" on support_tickets;
drop policy if exists "Staff can update support tickets" on support_tickets;
drop policy if exists "Super admins can delete support tickets" on support_tickets;
create policy "Staff can read support tickets"
on support_tickets for select to authenticated
using (exists (select 1 from admin_users where user_id = auth.uid()));
create policy "Staff can update support tickets"
on support_tickets for update to authenticated
using (exists (select 1 from admin_users where user_id = auth.uid()))
with check (exists (select 1 from admin_users where user_id = auth.uid()));
create policy "Super admins can delete support tickets"
on support_tickets for delete to authenticated
using (exists (select 1 from admin_users where user_id = auth.uid() and role = 'super_admin'));

commit;
