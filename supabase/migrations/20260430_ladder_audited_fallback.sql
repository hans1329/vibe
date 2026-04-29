-- §11-NEW.1.5 follow-up · MV uses COALESCE(audited_at, last_analysis_at,
-- project.created_at) so projects without analysis_snapshots rows still
-- appear in time-windowed ranks (today/week/month).
--
-- Origin: 1haeyo was registered before the snapshot pipeline was wired,
-- so its latest_snapshot LEFT JOIN returned NULL → rank_week was NULL →
-- /ladder week view rendered empty even though the project is live and
-- in the right category. Falling back to last_analysis_at (then
-- project.created_at) keeps the windowing semantics defensible without
-- forcing a re-audit.
--
-- Replaces the MV body from 20260429_ladder_events_v3.sql; same indexes
-- + same status filter (walk-on previews stay out).

DROP MATERIALIZED VIEW IF EXISTS ladder_rankings_mv;
CREATE MATERIALIZED VIEW ladder_rankings_mv AS
WITH latest_snapshot AS (
  SELECT DISTINCT ON (s.project_id)
    s.project_id, s.score_total, s.score_auto,
    s.created_at AS audited_at, s.commit_sha
  FROM analysis_snapshots s
  ORDER BY s.project_id, s.created_at DESC
),
ranked AS (
  SELECT
    p.id              AS project_id,
    COALESCE(p.business_category, p.detected_category, 'other') AS category,
    p.score_total, p.score_auto, p.audit_count,
    ls.commit_sha,
    COALESCE(ls.audited_at, p.last_analysis_at, p.created_at) AS audited_at,
    p.created_at AS project_created_at,
    CASE WHEN COALESCE(ls.audited_at, p.last_analysis_at, p.created_at)
              >= now() - interval '24 hours'
      THEN ROW_NUMBER() OVER (
        PARTITION BY COALESCE(p.business_category, p.detected_category, 'other')
        ORDER BY p.score_total DESC,
                 COALESCE(ls.audited_at, p.last_analysis_at, p.created_at) DESC,
                 p.score_auto DESC, p.audit_count ASC, p.created_at ASC
      ) ELSE NULL END AS rank_today,
    CASE WHEN COALESCE(ls.audited_at, p.last_analysis_at, p.created_at)
              >= now() - interval '7 days'
      THEN ROW_NUMBER() OVER (
        PARTITION BY COALESCE(p.business_category, p.detected_category, 'other')
        ORDER BY p.score_total DESC,
                 COALESCE(ls.audited_at, p.last_analysis_at, p.created_at) DESC,
                 p.score_auto DESC, p.audit_count ASC, p.created_at ASC
      ) ELSE NULL END AS rank_week,
    CASE WHEN COALESCE(ls.audited_at, p.last_analysis_at, p.created_at)
              >= now() - interval '30 days'
      THEN ROW_NUMBER() OVER (
        PARTITION BY COALESCE(p.business_category, p.detected_category, 'other')
        ORDER BY p.score_total DESC,
                 COALESCE(ls.audited_at, p.last_analysis_at, p.created_at) DESC,
                 p.score_auto DESC, p.audit_count ASC, p.created_at ASC
      ) ELSE NULL END AS rank_month,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(p.business_category, p.detected_category, 'other')
      ORDER BY p.score_total DESC,
               COALESCE(ls.audited_at, p.last_analysis_at, p.created_at) DESC,
               p.score_auto DESC, p.audit_count ASC, p.created_at ASC
    ) AS rank_all_time
  FROM projects p
  LEFT JOIN latest_snapshot ls ON ls.project_id = p.id
  WHERE p.score_total > 0
    AND p.status IN ('active', 'graduated', 'valedictorian')
)
SELECT project_id, category, score_total, score_auto, audit_count,
       audited_at, commit_sha,
       rank_today, rank_week, rank_month, rank_all_time
FROM ranked;

CREATE UNIQUE INDEX IF NOT EXISTS ladder_rankings_mv_pk
  ON ladder_rankings_mv (project_id);
CREATE INDEX IF NOT EXISTS ladder_rankings_mv_today_idx
  ON ladder_rankings_mv (category, rank_today) WHERE rank_today IS NOT NULL;
CREATE INDEX IF NOT EXISTS ladder_rankings_mv_week_idx
  ON ladder_rankings_mv (category, rank_week)  WHERE rank_week  IS NOT NULL;
CREATE INDEX IF NOT EXISTS ladder_rankings_mv_month_idx
  ON ladder_rankings_mv (category, rank_month) WHERE rank_month IS NOT NULL;
CREATE INDEX IF NOT EXISTS ladder_rankings_mv_all_idx
  ON ladder_rankings_mv (category, rank_all_time);
