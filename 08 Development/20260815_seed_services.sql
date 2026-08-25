-- D'FABULOUS SERVICES SEED
-- Source of truth: src/data/brand.ts SERVICES_LIST.
-- Non-destructive and idempotent: existing rows are preserved.
-- Execute in the hosted Supabase SQL Editor as an authorized database administrator.
-- No browser/service-role/RLS bypass is used by the application.

INSERT INTO public.services (
  id,
  slug,
  title,
  yoruba_name,
  short_description,
  category,
  is_active,
  display_order
)
SELECT seed.id,
       seed.slug,
       seed.title,
       seed.yoruba_name,
       seed.short_description,
       seed.category,
       seed.is_active,
       seed.display_order
FROM (
  VALUES
    (
      'alaga-iduro',
      '/services/alaga-iduro',
      'Alaga Iduro',
      'Alaga Iduro (Groom''s Family Spokesperson)',
      'Articulate spokesperson leading the groom''s family delegation during the traditional engagement ceremony with cultural dignity and respectful negotiation.',
      'core',
      true,
      1
    ),
    (
      'alaga-ijoko',
      '/services/alaga-ijoko',
      'Alaga Ijoko',
      'Alaga Ijoko (Bride''s Family Host)',
      'Official custodian and ceremonial host for the bride''s family, guiding ancestral rites, dowry proceedings, and family blessings.',
      'core',
      true,
      2
    ),
    (
      'wedding-mc',
      '/services/wedding-mc',
      'Wedding MC',
      'Master of Ceremonies',
      'Sophisticated, high-energy reception direction blending cultural warmth, crowd engagement, and seamless event flow.',
      'core',
      true,
      3
    ),
    (
      'engagement-coordination',
      '/services/engagement-coordination',
      'Engagement Coordination',
      'Traditional Protocol Management',
      'Comprehensive timeline structuring and ceremonial floor direction for Yoruba traditional engagements.',
      'specialist',
      true,
      4
    ),
    (
      'private-events',
      '/services/private-events',
      'Private Events',
      'Milestone Celebrations Host',
      'Regal hosting for milestone birthdays, anniversaries, chieftaincy celebrations, and exclusive private galas.',
      'specialist',
      true,
      5
    ),
    (
      'eru-iyawo',
      '/services/eru-iyawo',
      'Eru Iyawo / Gift Presentation',
      'Dowry Gift Presentation & Styling',
      'Opulent traditional dowry gift presentation styling and ceremonial unveiling protocols.',
      'specialist',
      true,
      6
    ),
    (
      'brand-influencing',
      '/services/brand-influencing',
      'Cultural & Luxury Ambassador',
      'Brand Ambassadorship & Cultural Partnerships',
      'High-level cultural representation and luxury brand ambassadorship for prestigious events.',
      'brand',
      true,
      7
    ),
    (
      'destination-events',
      '/services/destination-events',
      'Destination Yoruba Events',
      'International Destination Ceremonies',
      'Full ceremonial hosting for Yoruba traditional weddings across Europe, North America, and global destinations.',
      'specialist',
      true,
      8
    )
) AS seed(id, slug, title, yoruba_name, short_description, category, is_active, display_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.services existing
  WHERE existing.id = seed.id
);

-- Verification query: should return the eight canonical service IDs after execution.
SELECT id, title, category, is_active, display_order
FROM public.services
WHERE id IN (
  'alaga-iduro',
  'alaga-ijoko',
  'wedding-mc',
  'engagement-coordination',
  'private-events',
  'eru-iyawo',
  'brand-influencing',
  'destination-events'
)
ORDER BY display_order;
