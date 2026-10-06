begin;

create extension if not exists btree_gist;

drop policy if exists "Anyone can create appointments" on appointments;
drop policy if exists "Anyone can create a support ticket" on support_tickets;

alter table appointments
  add constraint appointments_no_therapist_overlap
  exclude using gist (
    therapist_id with =,
    appointment_date with =,
    tsrange(appointment_date + start_time, appointment_date + end_time, '[)') with &&
  )
  where (therapist_id is not null and status in ('pending', 'confirmed'));

create table appointment_notifications (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  notification_type text not null check (notification_type in ('request', 'confirmed', 'cancelled', 'reminder')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (appointment_id, notification_type)
);

alter table appointment_notifications enable row level security;

create table api_rate_limits (
  scope text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (scope, key_hash)
);
create index api_rate_limits_window_started_at_idx on api_rate_limits (window_started_at);

alter table api_rate_limits enable row level security;

create or replace function consume_api_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  delete from api_rate_limits
  where window_started_at < now() - interval '1 day';

  insert into api_rate_limits (scope, key_hash, window_started_at, request_count)
  values (p_scope, p_key_hash, now(), 1)
  on conflict (scope, key_hash) do update
  set
    request_count = case
      when api_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1
      else api_rate_limits.request_count + 1
    end,
    window_started_at = case
      when api_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then now()
      else api_rate_limits.window_started_at
    end
  returning request_count into current_count;

  return current_count <= p_limit;
end;
$$;

revoke all on function consume_api_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function consume_api_rate_limit(text, text, integer, integer) to service_role;

commit;
