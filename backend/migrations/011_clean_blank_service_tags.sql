-- v4.5.56 - Hide invalid blank service-tag rows from mobile selectors.
--
-- A legacy/mobile request path allowed an empty service tag to be
-- inserted. The API now rejects empty names and filters blanks, but this
-- idempotent cleanup also soft-disables any existing blank records such
-- as id/tag_id 30001 without physically deleting production data.

UPDATE service_tags
   SET is_deleted = 1,
       is_active = 0,
       status = 0
 WHERE TRIM(COALESCE(name, '')) = '';
