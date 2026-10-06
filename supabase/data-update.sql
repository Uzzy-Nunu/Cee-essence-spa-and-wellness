-- ============================================================
-- CEE ESSENCE — DATA UPDATE SCRIPT
-- Run this on the Supabase project where the schema has ALREADY
-- been applied with the tutorial's placeholder seed data.
-- Replaces that placeholder data with real Cee Essence content.
--
-- Assumes no real client appointments exist yet (pre-launch) --
-- if real appointments already reference the placeholder services,
-- handle those first, since services can't be deleted while
-- referenced (on delete restrict).
-- ============================================================

-- Clear placeholder data
delete from services;
delete from business_hours;
delete from spa_settings;

-- Real services
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

-- Real business hours
insert into business_hours (weekday, is_open, start_time, end_time)
values
  (0, true, '12:00', '18:00'),
  (1, true, '10:00', '20:00'),
  (2, true, '10:00', '20:00'),
  (3, true, '10:00', '20:00'),
  (4, true, '10:00', '20:00'),
  (5, true, '10:00', '20:00'),
  (6, true, '10:00', '20:00');

-- Real spa settings
insert into spa_settings (spa_name, spa_email, spa_phone, spa_address, slot_interval_minutes, booking_notice_hours)
values
  ('Cee Essence Spa & Wellness', 'hello@ceeessencespa.com', '+234 800 CEE-SPA1', 'Shop P8, The Bints Centre by Haimbridge, Abuja', 30, 2);

-- Therapists (safe to insert directly -- this table is new and starts empty)
insert into therapists (full_name, bio, is_active)
values
  ('Amaka O.', 'Senior massage therapist, specializing in deep tissue and hot stone therapy.', true),
  ('Chiamaka B.', 'Lead esthetician, specializing in facials and skin treatments.', true),
  ('Grace N.', 'Wellness therapist, specializing in body treatments, aromatherapy, and hand & foot care.', true);

-- Therapist-service mapping
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
