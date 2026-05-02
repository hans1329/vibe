-- ───────────────────────────────────────────────────────────────────────────
-- Pillar score · switch from additive audit_buffer to Y-fix max() model
-- ───────────────────────────────────────────────────────────────────────────
-- The earlier recalc_pillar_scores migration used:
--   audit_buffer = score_total - score_auto - score_forecast - score_community
--   new_total    = score_auto + forecast + community + audit_buffer
--
-- That preserved the Y-fix walk-on floor as a constant offset and stacked
-- engagement on top — monotonic, intuitive, but inflated. Engagement on a
-- league project always landed strictly higher than the post-audit Y-fix
-- score, with no upper anchor besides the 100 cap. Side effect: maa
-- (38 audit + small engagement) ended up at 92, beating supabase at 84
-- (40 audit, no engagement). That's reversed from the actual quality
-- ordering the audit captured.
--
-- The actual Y-fix model is
--   total = max(walk_on_floor, audit_pillar + forecast + community)
-- where engagement only matters once it exceeds the audit's anchored
-- score. Stricter, less responsive to small applauds, but produces a
-- defensible distribution: a project never out-ranks one with a stronger
-- audit unless its engagement pillar genuinely overtakes that gap.
--
-- The walk-on floor is whatever the latest analysis_snapshot recorded for
-- score_total. That snapshot is set by analyze-project at audit time and
-- is immutable, so it's the authoritative anchor without any new column
-- or Edge Function change. Fallback for never-audited rows: score_auto * 2,
-- which mirrors the old fallback inside analyze-project's claudeCurrent
-- computation.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recalc_pillar_scores(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id   uuid;
  v_score_auto   int;
  v_unique_voters int;
  v_total_votes  int;
  v_forecast     int;
  v_human_comments int;
  v_product_applauds int;
  v_community    int;
  v_walk_on_floor int;
  v_pillar_sum   int;
  v_total        int;
BEGIN
  SELECT creator_id, score_auto
    INTO v_creator_id, v_score_auto
    FROM projects
   WHERE id = p_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Walk-on floor = the most recent analysis_snapshot's score_total. That's
  -- exactly the Y-fix output analyze-project committed at audit time. It's
  -- immutable per snapshot, so engagement triggers can read it without
  -- racing the audit. NULL fallback (project that has no snapshot yet)
  -- mirrors analyze-project's own claudeCurrent fallback.
  SELECT score_total
    INTO v_walk_on_floor
    FROM analysis_snapshots
   WHERE project_id = p_id
   ORDER BY created_at DESC
   LIMIT 1;

  v_walk_on_floor := COALESCE(v_walk_on_floor, v_score_auto * 2);

  -- Forecast: votes excluding self-vote.
  SELECT COALESCE(COUNT(DISTINCT v.member_id), 0),
         COALESCE(SUM(v.vote_count), 0)
    INTO v_unique_voters, v_total_votes
    FROM votes v
   WHERE v.project_id = p_id
     AND (v_creator_id IS NULL OR v.member_id <> v_creator_id);

  v_forecast := LEAST(30, v_unique_voters * 2 + LEAST(v_total_votes, 30));

  -- Community: human comments + product applauds, excluding self.
  SELECT COALESCE(COUNT(*), 0)
    INTO v_human_comments
    FROM comments c
   WHERE c.project_id = p_id
     AND c.member_id IS NOT NULL
     AND (v_creator_id IS NULL OR c.member_id <> v_creator_id);

  SELECT COALESCE(COUNT(*), 0)
    INTO v_product_applauds
    FROM applauds a
   WHERE a.target_type = 'product'
     AND a.target_id = p_id
     AND (v_creator_id IS NULL OR a.member_id <> v_creator_id);

  v_community := LEAST(20, v_human_comments * 2 + v_product_applauds * 1);

  -- Y-fix max() model: pillar sum has to overtake the walk-on floor before
  -- it's visible. Below the floor, engagement accumulates silently and the
  -- ladder shows the audit anchor.
  v_pillar_sum := v_score_auto + v_forecast + v_community;
  v_total := LEAST(100, GREATEST(0, GREATEST(v_walk_on_floor, v_pillar_sum)));

  PERFORM set_config('app.allow_pillar_update', 'true', true);
  UPDATE projects
     SET score_forecast = v_forecast,
         score_community = v_community,
         score_total = v_total
   WHERE id = p_id;
  PERFORM set_config('app.allow_pillar_update', 'false', true);
END;
$$;

-- Backfill: re-run the new formula across every project so today's inflated
-- totals settle to the corrected distribution.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM projects LOOP
    PERFORM public.recalc_pillar_scores(r.id);
  END LOOP;
END;
$$;
