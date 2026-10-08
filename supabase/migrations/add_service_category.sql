-- ============================================================
-- CEE ESSENCE SPA & WELLNESS - SERVICE CATEGORY MIGRATION
-- Adds the category column to services and backfills existing data
-- ============================================================

-- 1. Add category column to services if not exists
alter table services 
  add column if not exists category text not null default 'Massage Treatments';

-- 2. Backfill existing services with their exact categories
update services set category = 'Massage Treatments'
where name in (
  'Signature Cee Essence Massage',
  'Swedish Massage',
  'Deep Tissue Massage',
  'Hot Stone Massage',
  'Aromatherapy Massage',
  'Couple''s Massage',
  'Prenatal Massage'
);

update services set category = 'Facial Treatments'
where name in (
  'Signature Facial',
  'Hydrating Facial',
  'Brightening Facial',
  'Anti-Aging Facial',
  'Deep Cleansing Facial'
);

update services set category = 'Body Treatments'
where name in (
  'Body Scrub & Polish',
  'Detox Body Wrap',
  'Half-Day Pamper Package'
);

update services set category = 'Hand & Foot Treatments'
where name in (
  'Signature Pedicure',
  'Signature Manicure',
  'Foot Reflexology'
);

-- Verify categorized services
select category, count(*), array_agg(name) as treatment_names
from services
group by category;
