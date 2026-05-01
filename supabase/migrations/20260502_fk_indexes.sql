-- ───────────────────────────────────────────────────────────────────────────
-- FK indexes · close the 18-column gap the audit flags as a perf risk
-- ───────────────────────────────────────────────────────────────────────────
-- audit-preview surfaces 'X unindexed FK columns — query perf cliff at >10K
-- rows' as a Claude qualitative deduction. PostgREST + Supabase auto-RLS
-- queries hit these columns through `where = $1` filters; without an index
-- we end up doing seq scans once tables grow. Add btree indexes for every
-- FK column missing one in the public schema.
--
-- All idempotent · re-runnable · doesn't lock writes (CREATE INDEX would,
-- but we use IF NOT EXISTS to skip already-indexed columns and don't
-- specify CONCURRENTLY so this can run inside a single transaction during
-- a maintenance window. The tables are small today; CONCURRENTLY can be
-- swapped in if any of these grow past ~1M rows).
-- ───────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_activity_point_ledger_applaud
  ON public.activity_point_ledger (related_applaud_id);
CREATE INDEX IF NOT EXISTS idx_activity_point_ledger_project
  ON public.activity_point_ledger (related_project_id);
CREATE INDEX IF NOT EXISTS idx_activity_point_ledger_vote
  ON public.activity_point_ledger (related_vote_id);

CREATE INDEX IF NOT EXISTS idx_analysis_snapshots_parent
  ON public.analysis_snapshots (parent_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_analysis_snapshots_triggered_by
  ON public.analysis_snapshots (triggered_by);

CREATE INDEX IF NOT EXISTS idx_comment_upvotes_member
  ON public.comment_upvotes (member_id);
CREATE INDEX IF NOT EXISTS idx_comments_member
  ON public.comments (member_id);

CREATE INDEX IF NOT EXISTS idx_event_entries_frozen_snapshot
  ON public.event_entries (frozen_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_events_created_by
  ON public.events (created_by);

CREATE INDEX IF NOT EXISTS idx_hall_of_fame_member
  ON public.hall_of_fame (member_id);

CREATE INDEX IF NOT EXISTS idx_md_discoveries_published
  ON public.md_discoveries (published_md_id);
CREATE INDEX IF NOT EXISTS idx_md_library_linked_project
  ON public.md_library (linked_project_id);

CREATE INDEX IF NOT EXISTS idx_members_grade_history_snapshot
  ON public.members_grade_history (snapshot_id);

CREATE INDEX IF NOT EXISTS idx_notifications_actor
  ON public.notifications (actor_id);
CREATE INDEX IF NOT EXISTS idx_notifications_project
  ON public.notifications (project_id);

CREATE INDEX IF NOT EXISTS idx_office_hours_events_host
  ON public.office_hours_events (host_id);
CREATE INDEX IF NOT EXISTS idx_office_hours_events_summary_post
  ON public.office_hours_events (summary_post_id);

CREATE INDEX IF NOT EXISTS idx_votes_season
  ON public.votes (season_id);
