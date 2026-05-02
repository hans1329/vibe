-- ───────────────────────────────────────────────────────────────────────────
-- Project view tracking · groundwork for the Community pillar's
-- "조회수 · 재방문율" signals (§6.1 / §2 Community)
-- ───────────────────────────────────────────────────────────────────────────
-- Today's score_community pillar only counts comments + applauds. The PRD
-- also wants views (raw exposure) and revisits (genuine return interest)
-- — those don't exist anywhere yet, not even in raw form. This migration
-- lays the storage + RPC + stats surface so the frontend can start emitting
-- view events. It does NOT plug the new signals into recalc_pillar_scores
-- yet; that wiring waits until we've watched real traffic for a couple of
-- weeks and calibrated the weighting (uncalibrated revisit rate could
-- dwarf comment/applaud weight). Calibration sits in INTERNAL.md §4 territory.
--
-- Privacy posture
--   · No raw IPs. The frontend hashes its own session id (random uuid kept
--     in localStorage) and that's all we persist.
--   · Optional member_id is set when the viewer is signed in.
--   · Project owners + admins read; nobody else can read individual rows.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_views (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  member_id       uuid        NULL     REFERENCES public.members(id)  ON DELETE SET NULL,
  session_hash    text        NULL,                       -- client-side random id, hashed before send
  user_agent_hash text        NULL,                       -- coarse UA bucket (browser family) — optional
  referrer_host   text        NULL,                       -- e.g. "x.com", "google.com" — domain only
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_views_project_created
  ON public.project_views (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_views_session_project
  ON public.project_views (session_hash, project_id, created_at DESC)
  WHERE session_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_views_member_project
  ON public.project_views (member_id, project_id, created_at DESC)
  WHERE member_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- record_project_view · client-callable RPC. Anonymous OK.
-- ───────────────────────────────────────────────────────────────────────────
-- Frontend calls this on ProjectDetailPage mount. Dedupe is handled at READ
-- time (stats functions group by day-bucket), not here, so retries / fast
-- re-mounts can happen without lossy reasoning. Idempotent in spirit, additive
-- in storage. If volume becomes a problem we'll add a unique partial index.
CREATE OR REPLACE FUNCTION public.record_project_view(
  p_project_id      uuid,
  p_session_hash    text DEFAULT NULL,
  p_user_agent_hash text DEFAULT NULL,
  p_referrer_host   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
  v_id        uuid;
BEGIN
  -- Pull member from the JWT if signed in. If not, member_id stays NULL and
  -- the view is anonymous (counted via session_hash for return-visitor math).
  v_member_id := auth.uid();

  -- Sanity: project must exist (defensive — RPC could be called with a
  -- random uuid by a drive-by client). FK already enforces but the explicit
  -- early return avoids a misleading constraint error.
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = p_project_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO project_views (project_id, member_id, session_hash, user_agent_hash, referrer_host)
  VALUES (p_project_id, v_member_id, p_session_hash, p_user_agent_hash, p_referrer_host)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_project_view(uuid, text, text, text) TO anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- project_view_stats · windowed counts for one project
-- ───────────────────────────────────────────────────────────────────────────
-- Returns the four numbers the Community pillar will eventually consume:
--   views               · raw count (incl. duplicates same-day same-session)
--   unique_sessions     · distinct session_hash + member_id keys (one identity = one)
--   returning_sessions  · identities that visited on >1 distinct day in the window
--   returning_rate      · returning_sessions / unique_sessions  (NULL if unique=0)
--
-- Same-day duplicates are NOT collapsed in `views` on purpose — UI can choose
-- to display raw or de-duped. Stats functions stay simple; UI does any further
-- shaping it needs.
CREATE OR REPLACE FUNCTION public.project_view_stats(
  p_project_id   uuid,
  p_window_days  int DEFAULT 30
)
RETURNS TABLE (
  views              bigint,
  unique_sessions    bigint,
  returning_sessions bigint,
  returning_rate     numeric(5,4)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recent AS (
    SELECT
      COALESCE(member_id::text, session_hash) AS identity,
      (created_at AT TIME ZONE 'UTC')::date    AS visit_day
      FROM project_views
     WHERE project_id = p_project_id
       AND created_at > now() - make_interval(days => p_window_days)
       AND COALESCE(member_id::text, session_hash) IS NOT NULL
  ),
  per_identity AS (
    SELECT identity, COUNT(DISTINCT visit_day) AS day_count
      FROM recent
     GROUP BY identity
  ),
  totals AS (
    SELECT COUNT(*)::bigint AS views FROM project_views
     WHERE project_id = p_project_id
       AND created_at > now() - make_interval(days => p_window_days)
  )
  SELECT
    (SELECT views FROM totals)                                    AS views,
    COALESCE((SELECT COUNT(*)::bigint FROM per_identity), 0)      AS unique_sessions,
    COALESCE((SELECT COUNT(*)::bigint FROM per_identity
               WHERE day_count > 1), 0)                           AS returning_sessions,
    CASE
      WHEN (SELECT COUNT(*) FROM per_identity) = 0 THEN NULL
      ELSE round(
        (SELECT COUNT(*)::numeric FROM per_identity WHERE day_count > 1)
        / NULLIF((SELECT COUNT(*)::numeric FROM per_identity), 0)
      , 4)
    END                                                            AS returning_rate;
$$;

GRANT EXECUTE ON FUNCTION public.project_view_stats(uuid, int) TO anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- RLS · table is private; everyone uses the RPC + stats functions instead
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.project_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_views_owner_read ON public.project_views;
CREATE POLICY project_views_owner_read
  ON public.project_views FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
       WHERE p.id = project_views.project_id
         AND (p.creator_id = auth.uid()
              OR EXISTS (SELECT 1 FROM members m WHERE m.id = auth.uid() AND m.is_admin))
    )
  );
-- No INSERT policy: writes happen only through SECURITY DEFINER record_project_view().
