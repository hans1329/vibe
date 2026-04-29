-- §11-NEW.1.1 follow-up · column-level SELECT grants on ladder columns.
-- Reason: 20260425140000_email_column_grants.sql blocked SELECT * on
-- projects and required explicit column-level GRANTs for anon +
-- authenticated. Migration A (20260429_ladder_events_v3.sql) added
-- business_category / detected_category / category_locked_until /
-- audit_count without GRANTing SELECT, so once the client started
-- including those columns in its select list, PostgREST rejected
-- the entire query and /projects rendered empty.
--
-- This migration restores SELECT visibility on the four ladder columns
-- only · all other privacy decisions (no email, no internal flags) stay
-- in place.

GRANT SELECT (
  business_category,
  detected_category,
  category_locked_until,
  audit_count
) ON projects TO anon, authenticated;
