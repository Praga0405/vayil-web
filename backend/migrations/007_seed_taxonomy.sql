-- 007_seed_taxonomy.sql
--
-- v4.5.16 — Replace dev/smoke-test taxonomy with the production-clean
-- category, sub-category, tag, and tools data from the mobile team's
-- reference dump (vayil-Dump20260527.sql).
--
-- Strategy:
--   1. Soft-delete the obvious smoke/test rows that polluted local
--      MySQL during the demo phase (name LIKE 'TestCat%' / 'SmokeCat%'
--      etc., or seed_source LIKE 'smoke%').
--   2. INSERT IGNORE the production-quality rows from the dump. The
--      `id` mirror column is UNIQUE — IGNORE keeps existing rows
--      untouched and only adds anything missing.
--   3. Skip is_deleted=1 rows in the dump (those are devs' own
--      junk: "venkat", "testing", "demo cat", etc.).
--
-- Safe to re-run. Existing legitimate rows are NOT clobbered.

/* ═══════════════════════════════════════════════════════════
 *  1. Clean obvious smoke/test rows from local
 * ═══════════════════════════════════════════════════════════ */
DELETE FROM service_subcategories
 WHERE name LIKE 'TestSub%' OR name LIKE 'SmokeSub%' OR seed_source LIKE 'smoke%' OR seed_source LIKE 'test%';

DELETE FROM service_categories
 WHERE name LIKE 'TestCat%' OR name LIKE 'SmokeCat%' OR seed_source LIKE 'smoke%' OR seed_source LIKE 'test%';

DELETE FROM service_tags
 WHERE seed_source LIKE 'smoke%' OR seed_source LIKE 'test%'
    OR name LIKE 'smoke-tag%' OR name LIKE 'test-tag%';

/* ═══════════════════════════════════════════════════════════
 *  2. Categories — from dump (only production-clean rows)
 *     Dump id range: 1, 2, 3, 4, 5, 6, 15, 16, 17, 23
 *     (Dump's is_deleted=1 rows are skipped — those were devs'
 *     local junk: venkat, testing, test cat, demo cat, demo category.)
 * ═══════════════════════════════════════════════════════════ */
INSERT IGNORE INTO service_categories
  (id, category_id, name, slug, icon_url, is_active, is_deleted, created_at, seed_source)
VALUES
  ( 1,  1, 'All',                       'all',                       'https://vayil-files.s3.ap-south-1.amazonaws.com/datas/1772627250835_1c.png', 1, 0, '2025-12-22 14:10:16', 'dump-007'),
  ( 2,  2, 'Electrical',                'electrical',                'https://vayil-files.s3.ap-south-1.amazonaws.com/2c.png',                    1, 0, '2025-12-22 14:10:16', 'dump-007'),
  ( 3,  3, 'Kitchen Renovation',        'kitchen-renovation',        'https://vayil-files.s3.ap-south-1.amazonaws.com/3c.png',                    1, 0, '2025-12-22 14:10:16', 'dump-007'),
  ( 4,  4, 'Painting',                  'painting',                  'https://vayil-files.s3.ap-south-1.amazonaws.com/4c.png',                    1, 0, '2025-12-22 14:10:16', 'dump-007'),
  ( 5,  5, 'Waterproofing',             'waterproofing',             'https://vayil-files.s3.ap-south-1.amazonaws.com/1c.png',                    1, 0, '2025-12-22 14:10:16', 'dump-007'),
  ( 6,  6, 'Bathroom Renovation',       'bathroom-renovation',       'https://vayil-files.s3.ap-south-1.amazonaws.com/1c.png',                    1, 0, '2026-01-23 07:28:26', 'dump-007'),
  (15, 15, 'Plumbing',                  'plumbing',                  'https://vayil-files.s3.ap-south-1.amazonaws.com/1c.png',                    1, 0, '2026-02-04 09:54:53', 'dump-007'),
  (16, 16, 'AC Install & Maintenance',  'ac-install-maintenance',    'https://vayil-files.s3.ap-south-1.amazonaws.com/1c.png',                    1, 0, '2026-02-09 08:34:09', 'dump-007'),
  (17, 17, 'Transport',                 'transport',                 'https://vayil-files.s3.ap-south-1.amazonaws.com/1c.png',                    1, 0, '2026-02-25 12:55:16', 'dump-007'),
  (23, 23, 'Interior Design',           'interior-design',           'https://vayil-files.s3.ap-south-1.amazonaws.com/datas/1778579914262_3c.png', 1, 0, '2026-05-12 09:58:34', 'dump-007');

/* ═══════════════════════════════════════════════════════════
 *  3. Sub-categories — from dump (production-clean rows only)
 *     Dump rows skipped: is_deleted=1 (Vayil/Abhayapuri/Bathroom/venkat)
 * ═══════════════════════════════════════════════════════════ */
INSERT IGNORE INTO service_subcategories
  (id, subcategory_id, category_id, name, slug, is_active, is_deleted, created_at, seed_source)
VALUES
  ( 2,  2,  4, 'Exterior',          'exterior',           1, 0, '2025-12-22 14:10:16', 'dump-007'),
  ( 3,  3,  4, 'Texture',           'texture',            1, 0, '2025-12-22 14:10:16', 'dump-007'),
  ( 5,  5,  4, 'Waterproof paint',  'waterproof-paint',   1, 0, '2025-12-22 14:10:16', 'dump-007'),
  ( 6,  6, 15, 'Pipe repair',       'pipe-repair',        1, 0, '2025-12-22 14:10:16', 'dump-007'),
  ( 7,  7, 15, 'New installation',  'new-installation',   1, 0, '2025-12-22 14:10:16', 'dump-007'),
  (13, 13, 15, 'Tap / fixture',     'tap-fixture',        1, 0, '2026-01-29 11:09:12', 'dump-007'),
  (15, 15,  2, 'Wiring',            'wiring',             1, 0, '2026-02-19 10:12:34', 'dump-007'),
  (16, 16,  2, 'Switches',          'switches',           1, 0, '2026-02-19 10:13:52', 'dump-007'),
  (17, 17,  2, 'MCB / fuse',        'mcb-fuse',           1, 0, '2026-02-19 10:15:22', 'dump-007'),
  (18, 18,  2, 'Fan & light install','fan-light-install', 1, 0, '2026-02-19 10:17:19', 'dump-007'),
  (19, 19,  5, 'Terrace',           'terrace',            1, 0, '2026-02-19 10:18:46', 'dump-007'),
  (21, 21,  5, 'Wall seepage',      'wall-seepage',       1, 0, '2026-02-19 10:21:45', 'dump-007'),
  (22, 22,  5, 'Tank',              'tank',               1, 0, '2026-02-19 10:22:09', 'dump-007'),
  (23, 23,  3, 'Modular',           'modular',            1, 0, '2026-02-19 10:23:00', 'dump-007'),
  (24, 24,  3, 'Platform',          'platform',           1, 0, '2026-02-19 10:23:20', 'dump-007'),
  (25, 25,  3, 'Chimney',           'chimney',            1, 0, '2026-02-19 10:23:40', 'dump-007'),
  (26, 26,  3, 'Sink',              'sink',               1, 0, '2026-02-19 10:24:03', 'dump-007'),
  (27, 27,  6, 'Tiles',             'tiles',              1, 0, '2026-02-19 10:24:40', 'dump-007'),
  (28, 28,  6, 'Fittings',          'fittings',           1, 0, '2026-02-19 10:25:38', 'dump-007'),
  (29, 29,  6, 'Complete remodel',  'complete-remodel',   1, 0, '2026-02-19 10:27:58', 'dump-007'),
  (30, 30, 16, 'Split AC',          'split-ac',           1, 0, '2026-02-19 10:28:35', 'dump-007'),
  (31, 31, 16, 'Window AC',         'window-ac',          1, 0, '2026-02-19 10:28:54', 'dump-007'),
  (32, 32, 16, 'Servicing',         'servicing',          1, 0, '2026-02-19 10:29:15', 'dump-007'),
  (33, 33, 16, 'Gas refill',        'gas-refill',         1, 0, '2026-02-19 10:29:44', 'dump-007');

/* ═══════════════════════════════════════════════════════════
 *  4. Service tags — from dump (production-clean rows only)
 * ═══════════════════════════════════════════════════════════ */
INSERT IGNORE INTO service_tags
  (id, tag_id, name, is_active, is_deleted, created_at, seed_source)
VALUES
  ( 2,  2, 'Bathroom Upgrades',     1, 0, '2026-01-27 09:02:25', 'dump-007'),
  ( 3,  3, 'Home Additions',        1, 0, '2026-01-27 09:02:25', 'dump-007'),
  ( 4,  4, 'Living Room Makeovers', 1, 0, '2026-01-27 09:02:25', 'dump-007'),
  ( 5,  5, 'Basement Finishing',    1, 0, '2026-01-27 09:02:25', 'dump-007'),
  ( 6,  6, 'Outdoor Spaces',        1, 0, '2026-01-27 09:02:25', 'dump-007'),
  ( 7,  7, 'Expanding Your Space',  1, 0, '2026-01-27 09:02:25', 'dump-007'),
  ( 8,  8, 'Painting',              1, 0, '2026-01-27 09:02:31', 'dump-007'),
  ( 9,  9, 'Exterior',              1, 0, '2026-01-27 09:10:44', 'dump-007'),
  (12, 12, 'Interior',              1, 0, '2026-01-27 09:19:43', 'dump-007'),
  (18, 18, 'Exterior Painting',     1, 0, '2026-02-06 13:38:28', 'dump-007'),
  (19, 19, 'Transport Services',    1, 0, '2026-02-20 09:14:37', 'dump-007'),
  (20, 20, 'Civil Construction',    1, 0, '2026-02-25 06:27:53', 'dump-007'),
  (23, 23, 'Designer Uniforms',     1, 0, '2026-03-07 04:20:48', 'dump-007'),
  (24, 24, 'Flooring',              1, 0, '2026-03-07 04:47:35', 'dump-007'),
  (25, 25, '3D Home Design',        1, 0, '2026-03-07 04:47:47', 'dump-007');

/*  tools_master not seeded from dump:
 *   - Dump has a single row (Brush) which is marked is_deleted=1.
 *   - Local already has plenty of real tools (Drill Machine, Plumbing
 *     Wrench Set, Pipe Cutter, ...) seeded elsewhere.
 *   - Dump schema also diverges (tool_name vs name, no is_active).
 *   No-op here is correct.
 */
