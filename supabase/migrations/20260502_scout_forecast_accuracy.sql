-- ───────────────────────────────────────────────────────────────────────────
-- Scout forecast accuracy · per-vote correctness + cached member hit rate
-- ───────────────────────────────────────────────────────────────────────────
-- §6.1 says Scout pillar = "누적 Vote 수 + 적중률" — but until now we tracked
-- only the count. There's no per-vote correctness flag and no cached hit rate
-- on members. The season-end engine (§16.2 P8) needs both: hit rate to (1)
-- promote Silver/Gold/Platinum via the OR-condition path (§9), and (2) feed
-- the season-end Scout pillar weighting.
--
-- This migration adds the storage + the deterministic functions. It does NOT
-- run them on a schedule yet — that's the job of season-end Cron, which lands
-- last per CLAUDE.md ordering policy. The functions are callable today (e.g.
-- from /admin to evaluate a finished season manually).
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Per-vote correctness column
-- NULL = not yet evaluated (season still live)
-- TRUE  = the project this vote backed graduated (valedictorian/honors/graduate)
-- FALSE = it landed in Rookie Circle or never graduated
ALTER TABLE public.votes
  ADD COLUMN IF NOT EXISTS is_correct boolean NULL,
  ADD COLUMN IF NOT EXISTS evaluated_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_votes_member_correct
  ON public.votes (member_id, is_correct)
  WHERE is_correct IS NOT NULL;

-- 2. Cached member hit rate
-- Stored on members so /scouts and tier promotion can read it without a
-- COUNT() join every time. Updated by recompute_member_forecast_accuracy().
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS forecast_accuracy numeric(5,4) NULL,   -- 0..1
  ADD COLUMN IF NOT EXISTS forecast_correct_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forecast_evaluated_count int NOT NULL DEFAULT 0;

-- ───────────────────────────────────────────────────────────────────────────
-- evaluate_votes_for_season(p_season_id) · season-end correctness pass
-- ───────────────────────────────────────────────────────────────────────────
-- For every vote whose project belongs to this season, decide whether the
-- prediction was right based on the project's final graduation_grade. This
-- is the deterministic part of the season-end engine — call it once per
-- closed season; idempotent (re-running just re-stamps the same values).
--
-- "Correct" definition: a vote backs the project ⇒ correct iff that project
-- ended in a graduating tier. Rookie Circle / NULL grade ⇒ incorrect. This is
-- intentionally binary; predicted_score is a UX field and not part of
-- correctness — gradation could be added later if we want fractional credit.
CREATE OR REPLACE FUNCTION public.evaluate_votes_for_season(p_season_id uuid)
RETURNS TABLE(votes_evaluated int, members_touched int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_members int;
BEGIN
  -- COALESCE the grade so a NULL graduation_grade resolves to FALSE
  -- (= "treated as Rookie Circle = prediction wrong") rather than NULL.
  -- Plain `NULL IN (...)` would write NULL into is_correct and silently
  -- skip the row — only safe to call this function after the season has
  -- actually closed, when null grade means "didn't graduate" not "TBD".
  WITH evaluated AS (
    UPDATE public.votes v
       SET is_correct = (COALESCE(p.graduation_grade, '') IN ('valedictorian','honors','graduate')),
           evaluated_at = now()
      FROM public.projects p
     WHERE v.project_id = p.id
       AND p.season_id  = p_season_id
       AND v.member_id IS NOT NULL          -- anonymous votes don't have a hit rate
    RETURNING v.member_id
  )
  SELECT COUNT(*)::int, COUNT(DISTINCT member_id)::int
    INTO v_count, v_members
    FROM evaluated;

  -- Refresh the cached accuracy for every member whose votes just got stamped.
  PERFORM public.recompute_member_forecast_accuracy(m_id)
     FROM (
       SELECT DISTINCT v.member_id AS m_id
         FROM public.votes v
         JOIN public.projects p ON p.id = v.project_id
        WHERE p.season_id = p_season_id
          AND v.member_id IS NOT NULL
     ) sub;

  RETURN QUERY SELECT v_count, v_members;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- recompute_member_forecast_accuracy(p_member_id) · cache rebuild for one
-- ───────────────────────────────────────────────────────────────────────────
-- Counts only evaluated votes (is_correct IS NOT NULL). Live-season votes
-- don't contribute, so a Scout's accuracy isn't dragged down by undecided
-- bets. forecast_accuracy stays NULL until at least one vote has been
-- evaluated — distinguishes "no track record" from "0% track record".
CREATE OR REPLACE FUNCTION public.recompute_member_forecast_accuracy(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_correct int;
  v_total   int;
  v_acc     numeric(5,4);
BEGIN
  SELECT COUNT(*) FILTER (WHERE is_correct IS TRUE),
         COUNT(*) FILTER (WHERE is_correct IS NOT NULL)
    INTO v_correct, v_total
    FROM public.votes
   WHERE member_id = p_member_id;

  IF v_total = 0 THEN
    v_acc := NULL;
  ELSE
    v_acc := round(v_correct::numeric / v_total::numeric, 4);
  END IF;

  UPDATE public.members
     SET forecast_correct_count   = v_correct,
         forecast_evaluated_count = v_total,
         forecast_accuracy        = v_acc
   WHERE id = p_member_id;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- evaluate_votes_for_project(p_project_id) · single-project pass
-- ───────────────────────────────────────────────────────────────────────────
-- Convenience wrapper for the case where graduation_grade flips on a single
-- project (e.g. admin override) without running the whole season's pass.
-- Same correctness rule, scoped to the votes on that one project.
CREATE OR REPLACE FUNCTION public.evaluate_votes_for_project(p_project_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grade text;
  v_count int;
BEGIN
  SELECT graduation_grade INTO v_grade
    FROM public.projects WHERE id = p_project_id;

  WITH evaluated AS (
    UPDATE public.votes v
       SET is_correct = (COALESCE(v_grade, '') IN ('valedictorian','honors','graduate')),
           evaluated_at = now()
     WHERE v.project_id = p_project_id
       AND v.member_id IS NOT NULL
    RETURNING member_id
  )
  SELECT COUNT(*)::int INTO v_count FROM evaluated;

  PERFORM public.recompute_member_forecast_accuracy(m_id)
     FROM (SELECT DISTINCT member_id AS m_id FROM public.votes
            WHERE project_id = p_project_id AND member_id IS NOT NULL) sub;

  RETURN v_count;
END;
$$;
