-- ============================================================
-- CEE ESSENCE SPA & WELLNESS — FULL DATABASE SCHEMA
-- Combined file: base tutorial schema + architecture additions
-- Run this entire file in the Supabase SQL editor, top to bottom.
-- ============================================================


-- ============================================================
-- SECTION 1: BASE SCHEMA (from the tutorial)
-- ============================================================

create table services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes > 0),
  price numeric(10,2),
  is_active boolean not null default true,
  created_at timestamp with time zone default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text not null,
  service_id uuid not null references services(id) on delete restrict,
  appointment_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  notes text,
  created_at timestamp with time zone default now()
);

create table business_hours (
  id uuid primary key default gen_random_uuid(),
  weekday integer not null check (weekday between 0 and 6),
  is_open boolean not null default true,
  start_time time,
  end_time time
);

create table blocked_dates (
  id uuid primary key default gen_random_uuid(),
  blocked_date date not null unique,
  reason text,
  created_at timestamp with time zone default now()
);

create table spa_settings (
  id uuid primary key default gen_random_uuid(),
  spa_name text not null default 'Serenity Spa Studio',
  spa_email text,
  spa_phone text,
  spa_address text,
  slot_interval_minutes integer not null default 30,
  booking_notice_hours integer not null default 2,
  created_at timestamp with time zone default now()
);

create table admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamp with time zone default now()
);

insert into services (name, description, duration_minutes, price)
values
  ('Signature Cee Essence Massage', 'A full-body massage blending Swedish and deep tissue techniques, finished with a warm aromatherapy oil application.', 75, 55000),
  ('Swedish Massage', 'Classic relaxation massage using long, flowing strokes to ease tension and improve circulation.', 60, 35000),
  ('Deep Tissue Massage', 'Firmer pressure targeting chronic muscle tension and knots.', 60, 40000),
  ('Hot Stone Massage', 'Heated basalt stones combined with massage to release deep tension and promote circulation.', 75, 45000),
  ('Aromatherapy Massage', 'A gentler massage using a curated essential oil blend chosen to the client''s mood.', 60, 38000),
  ('Couple''s Massage', 'A shared relaxation massage experience for two.', 60, 75000),
  ('Prenatal Massage', 'Positioned for comfort and safety in later pregnancy.', 60, 38000),
  ('Signature Facial', 'A tailored cleansing, exfoliating, and hydrating facial suited to the client''s skin type.', 60, 35000),
  ('Hydrating Facial', 'Deep hydration for dry or dehydrated skin, finished with a nourishing mask.', 45, 28000),
  ('Brightening Facial', 'Vitamin C-forward treatment targeting dullness, dark spots, and uneven tone.', 60, 40000),
  ('Anti-Aging Facial', 'Collagen-supporting treatment focused on fine lines and firmness.', 60, 45000),
  ('Deep Cleansing Facial', 'Thorough pore cleansing and extraction for congested or acne-prone skin.', 45, 30000),
  ('Body Scrub & Polish', 'Full-body exfoliation leaving skin smooth and refreshed.', 45, 30000),
  ('Detox Body Wrap', 'A mineral-rich wrap designed to draw out toxins and leave skin renewed.', 60, 40000),
  ('Half-Day Pamper Package', 'Massage, facial, and body scrub combined -- our most popular package booking.', 180, 90000),
  ('Signature Pedicure', 'Foot soak, shaping, scrub, massage, and polish.', 60, 20000),
  ('Signature Manicure', 'Hand soak, shaping, cuticle care, massage, and polish.', 45, 16000),
  ('Foot Reflexology', 'Pressure-point foot therapy distinct from a standard foot massage, promoting whole-body relaxation.', 45, 22000);

insert into business_hours (weekday, is_open, start_time, end_time)
values
  (0, true, '12:00', '18:00'),
  (1, true, '10:00', '20:00'),
  (2, true, '10:00', '20:00'),
  (3, true, '10:00', '20:00'),
  (4, true, '10:00', '20:00'),
  (5, true, '10:00', '20:00'),
  (6, true, '10:00', '20:00');

insert into spa_settings (spa_name, spa_email, spa_phone, spa_address, slot_interval_minutes, booking_notice_hours)
values
  ('Cee Essence Spa & Wellness', 'hello@ceeessencespa.com', '+234 800 CEE-SPA1', 'Shop P8, The Bints Centre by Haimbridge, Abuja', 30, 2);

alter table admin_users enable row level security;
alter table services enable row level security;
alter table appointments enable row level security;
alter table business_hours enable row level security;
alter table blocked_dates enable row level security;
alter table spa_settings enable row level security;

create policy "Anyone can read active services"
on services
for select
to anon, authenticated
using (is_active = true);

create policy "Admins can manage services"
on services
for all
to authenticated
using (
  exists (
    select 1
    from admin_users
    where admin_users.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from admin_users
    where admin_users.user_id = auth.uid()
  )
);

create policy "Anyone can create appointments"
on appointments
for insert
to anon, authenticated
with check (true);

create policy "Admins can read appointments"
on appointments
for select
to authenticated
using (
  exists (
    select 1
    from admin_users
    where admin_users.user_id = auth.uid()
  )
);

create policy "Admins can update appointments"
on appointments
for update
to authenticated
using (
  exists (
    select 1
    from admin_users
    where admin_users.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from admin_users
    where admin_users.user_id = auth.uid()
  )
);

create policy "Anyone can read business hours"
on business_hours
for select
to anon, authenticated
using (true);

create policy "Admins can manage business hours"
on business_hours
for all
to authenticated
using (
  exists (
    select 1
    from admin_users
    where admin_users.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from admin_users
    where admin_users.user_id = auth.uid()
  )
);

create policy "Anyone can read blocked dates"
on blocked_dates
for select
to anon, authenticated
using (true);

create policy "Admins can manage blocked dates"
on blocked_dates
for all
to authenticated
using (
  exists (
    select 1
    from admin_users
    where admin_users.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from admin_users
    where admin_users.user_id = auth.uid()
  )
);

create policy "Anyone can read spa settings"
on spa_settings
for select
to anon, authenticated
using (true);

create policy "Admins can manage spa settings"
on spa_settings
for all
to authenticated
using (
  exists (
    select 1
    from admin_users
    where admin_users.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from admin_users
    where admin_users.user_id = auth.uid()
  )
);

create policy "Users can read their own admin row"
on admin_users
for select
to authenticated
using (auth.uid() = user_id);

-- Replace with your real auth user UID (Supabase Dashboard > Authentication > Users)
insert into admin_users (user_id) values ('PASTE_YOUR_AUTH_USER_ID_HERE');


-- ============================================================
-- SECTION 2: ADDITIONS (therapists, support tickets, RAG chatbot)
-- ============================================================

-- ------------------------------------------------------------
-- 2.1 THERAPISTS
-- ------------------------------------------------------------

create table therapists (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  bio text,
  photo_url text,
  is_active boolean not null default true,
  created_at timestamp with time zone default now()
);

-- Which therapists can perform which services (many-to-many)
create table therapist_services (
  therapist_id uuid not null references therapists(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  primary key (therapist_id, service_id)
);

-- Individual therapist absences (separate from spa-wide blocked_dates)
create table therapist_time_off (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references therapists(id) on delete cascade,
  off_date date not null,
  start_time time,  -- null = entire day off
  end_time time,
  reason text,
  created_at timestamp with time zone default now()
);

-- Link each appointment to the assigned therapist (nullable = "any available")
alter table appointments
  add column therapist_id uuid references therapists(id) on delete restrict;

insert into therapists (full_name, bio, is_active)
values
  ('Amaka O.', 'Senior massage therapist, specializing in deep tissue and hot stone therapy.', true),
  ('Chiamaka B.', 'Lead esthetician, specializing in facials and skin treatments.', true),
  ('Grace N.', 'Wellness therapist, specializing in body treatments, aromatherapy, and hand & foot care.', true);

insert into therapist_services (therapist_id, service_id)
select t.id, s.id
from therapists t, services s
where
  (t.full_name = 'Amaka O.' and s.name in (
    'Signature Cee Essence Massage', 'Deep Tissue Massage', 'Hot Stone Massage',
    'Swedish Massage', 'Couple''s Massage', 'Prenatal Massage'
  ))
  or (t.full_name = 'Chiamaka B.' and s.name in (
    'Signature Facial', 'Hydrating Facial', 'Brightening Facial',
    'Anti-Aging Facial', 'Deep Cleansing Facial'
  ))
  or (t.full_name = 'Grace N.' and s.name in (
    'Aromatherapy Massage', 'Body Scrub & Polish', 'Detox Body Wrap',
    'Signature Pedicure', 'Signature Manicure', 'Foot Reflexology'
  ))
  or (s.name = 'Half-Day Pamper Package'); -- all therapists can coordinate this combo booking

-- ------------------------------------------------------------
-- 2.2 SUPPORT TICKETS (chatbot complaints / human handoff)
-- ------------------------------------------------------------

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  client_name text,
  client_email text,
  client_phone text,
  appointment_id uuid references appointments(id) on delete set null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  source text not null default 'chatbot' check (source in ('chatbot', 'form', 'other')),
  created_at timestamp with time zone default now()
);

-- ------------------------------------------------------------
-- 2.3 RAG CHATBOT KNOWLEDGE BASE
-- ------------------------------------------------------------

create extension if not exists vector;

create table kb_chunks (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding vector(768), -- Gemini text-embedding-004 outputs 768 dimensions
  source_section text,
  updated_at timestamp with time zone default now()
);

-- Cosine-similarity index for fast retrieval
create index on kb_chunks using hnsw (embedding vector_cosine_ops);

create table chat_logs (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  role text not null check (role in ('user', 'assistant')),
  message text not null,
  flagged_complaint boolean not null default false,
  created_at timestamp with time zone default now()
);

-- ------------------------------------------------------------
-- 2.4 ROW LEVEL SECURITY
-- ------------------------------------------------------------

alter table therapists enable row level security;
alter table therapist_services enable row level security;
alter table therapist_time_off enable row level security;
alter table support_tickets enable row level security;
alter table kb_chunks enable row level security;
alter table chat_logs enable row level security;

-- Therapists: publicly readable (clients choose one), admin-managed
create policy "Anyone can read active therapists"
on therapists
for select
to anon, authenticated
using (is_active = true);

create policy "Admins can manage therapists"
on therapists
for all
to authenticated
using (exists (select 1 from admin_users where admin_users.user_id = auth.uid()))
with check (exists (select 1 from admin_users where admin_users.user_id = auth.uid()));

-- Therapist-service mapping: publicly readable, admin-managed
create policy "Anyone can read therapist-service mapping"
on therapist_services
for select
to anon, authenticated
using (true);

create policy "Admins can manage therapist-service mapping"
on therapist_services
for all
to authenticated
using (exists (select 1 from admin_users where admin_users.user_id = auth.uid()))
with check (exists (select 1 from admin_users where admin_users.user_id = auth.uid()));

-- Therapist time off: admin-only (availability is computed server-side,
-- not read directly by clients)
create policy "Admins can manage therapist time off"
on therapist_time_off
for all
to authenticated
using (exists (select 1 from admin_users where admin_users.user_id = auth.uid()))
with check (exists (select 1 from admin_users where admin_users.user_id = auth.uid()));

-- Support tickets: anyone (incl. the chatbot acting as an anon client)
-- can create one; only admins can read/update
create policy "Anyone can create a support ticket"
on support_tickets
for insert
to anon, authenticated
with check (true);

create policy "Admins can read support tickets"
on support_tickets
for select
to authenticated
using (exists (select 1 from admin_users where admin_users.user_id = auth.uid()));

create policy "Admins can update support tickets"
on support_tickets
for update
to authenticated
using (exists (select 1 from admin_users where admin_users.user_id = auth.uid()))
with check (exists (select 1 from admin_users where admin_users.user_id = auth.uid()));

-- kb_chunks and chat_logs: NO public policies on purpose.
-- RLS is enabled with zero anon/authenticated policies, meaning the
-- public API can't touch these at all. The backend accesses them using
-- the Supabase service_role key, which bypasses RLS entirely -- the
-- only way this data should ever be read or written.
