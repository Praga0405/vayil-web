-- 008_fix_subcategory_mapping.sql
--
-- v4.5.17 — Migration 007 seeded dump sub-categories using the dump's
-- raw `category_id` values. Those IDs collide with the local database's
-- pre-existing categories (dump cat_id=2 is "Electrical" but local
-- cat_id=2 is "Bathroom"; dump cat_id=3 is "Kitchen Renovation" but
-- local cat_id=3 is "Electrical").  Result: sub-categories like Wiring
-- and Switches landed under the local "Bathroom" category, Modular and
-- Chimney landed under local "Electrical", etc.
--
-- Fix: delete the mis-keyed dump-007 sub-categories and re-INSERT each
-- one with the LOCAL category_id resolved by slug-based JOIN. That way
-- the linkage is always correct regardless of the local DB's existing
-- category IDs.

/* clean the mis-keyed dump rows */
DELETE FROM service_subcategories WHERE seed_source = 'dump-007';

/* Re-seed using slug-based JOIN so subcategory.category_id always
 * points at the LOCAL "category with this slug", not the dump's PK.
 * Each INSERT picks the local category by slug; if no match (i.e. the
 * category isn't seeded locally) the row is silently skipped. */

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Exterior', 'exterior', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug = 'painting' AND sc.status = 1 LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Texture', 'texture', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug = 'painting' AND sc.status = 1 LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Waterproof paint', 'waterproof-paint', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug = 'painting' AND sc.status = 1 LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Pipe repair', 'pipe-repair', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug = 'plumbing' AND sc.status = 1 LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'New installation', 'new-installation', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug = 'plumbing' AND sc.status = 1 LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Tap / fixture', 'tap-fixture', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug = 'plumbing' AND sc.status = 1 LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Wiring', 'wiring', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug = 'electrical' AND sc.status = 1 LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Switches', 'switches', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug = 'electrical' AND sc.status = 1 LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'MCB / fuse', 'mcb-fuse', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug = 'electrical' AND sc.status = 1 LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Fan & light install', 'fan-light-install', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug = 'electrical' AND sc.status = 1 LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Terrace', 'terrace', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug = 'waterproofing' AND sc.status = 1 LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Wall seepage', 'wall-seepage', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug = 'waterproofing' AND sc.status = 1 LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Tank', 'tank', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug = 'waterproofing' AND sc.status = 1 LIMIT 1;

/* Kitchen — dump's "Kitchen Renovation" slug. Local has slug='kitchen' */
INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Modular', 'modular', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug IN ('kitchen', 'kitchen-renovation') AND sc.status = 1 ORDER BY sc.category_id LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Platform', 'platform', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug IN ('kitchen', 'kitchen-renovation') AND sc.status = 1 ORDER BY sc.category_id LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Chimney', 'chimney', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug IN ('kitchen', 'kitchen-renovation') AND sc.status = 1 ORDER BY sc.category_id LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Sink', 'sink', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug IN ('kitchen', 'kitchen-renovation') AND sc.status = 1 ORDER BY sc.category_id LIMIT 1;

/* Bathroom — dump's slug 'bathroom-renovation'. Local has slug='bathroom' */
INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Tiles', 'tiles', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug IN ('bathroom', 'bathroom-renovation') AND sc.status = 1 ORDER BY sc.category_id LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Fittings', 'fittings', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug IN ('bathroom', 'bathroom-renovation') AND sc.status = 1 ORDER BY sc.category_id LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Complete remodel', 'complete-remodel', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug IN ('bathroom', 'bathroom-renovation') AND sc.status = 1 ORDER BY sc.category_id LIMIT 1;

/* AC — dump's 'ac-install-maintenance'. Local has 'ac-service' */
INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Split AC', 'split-ac', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug IN ('ac-service', 'ac-install-maintenance') AND sc.status = 1 ORDER BY sc.category_id LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Window AC', 'window-ac', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug IN ('ac-service', 'ac-install-maintenance') AND sc.status = 1 ORDER BY sc.category_id LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Servicing', 'servicing', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug IN ('ac-service', 'ac-install-maintenance') AND sc.status = 1 ORDER BY sc.category_id LIMIT 1;

INSERT IGNORE INTO service_subcategories
  (name, slug, category_id, is_active, is_deleted, seed_source)
SELECT 'Gas refill', 'gas-refill', sc.category_id, 1, 0, 'dump-007'
  FROM service_categories sc WHERE sc.slug IN ('ac-service', 'ac-install-maintenance') AND sc.status = 1 ORDER BY sc.category_id LIMIT 1;
