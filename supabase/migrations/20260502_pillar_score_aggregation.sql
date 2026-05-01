-- ───────────────────────────────────────────────────────────────────────────
-- Pillar score aggregation · turn dead score_forecast/score_community columns
-- into live, vote/applaud/comment-driven values
-- ───────────────────────────────────────────────────────────────────────────
-- Until now every active project sat at score_forecast=0, score_community=1
-- regardless of actual votes / applauds / comments — only score_auto and
-- score_total were updated (by the Edge Function at audit time). CLAUDE.md
-- §6.1 specifies a 50/30/20 split, so the engagement pillars need to lift
-- score_total in real time as the league reacts.
--
-- Design choices:
--   · Triggers, not cron — users expect ladder to react when they vote/applaud
--   · audit_buffer trick (see below) preserves Y-fix's walk-on floor without
--     adding a new column or touching the Edge Function
--   · Self-action exclusion — creators don't pad their own scores
--   · Polymorphic applauds — only target_type='product' counts toward the
--     project's community pillar; comment/build_log applauds are unrelated
--   · Comments with member_id IS NULL (Stage Manager auto-posts) are excluded
--
-- Formula:
--   score_forecast (0-30):
--     unique_voters = COUNT(DISTINCT member_id) of votes ON project,
--                     excluding the creator
--     total_votes   = SUM(count)             of votes ON project,
--                     excluding the creator
--     raw           = unique_voters * 2 + LEAST(total_votes, 30)
--     score_forecast = LEAST(30, raw)
--     -- diversity counts double; whale-mass voting capped at 30
--
--   score_community (0-20):
--     human_comments  = COUNT(comments)  excluding the creator's own and nulls
--     product_applauds = COUNT(applauds) where target_type='product',
--                        excluding the creator's own
--     raw             = human_comments * 2 + product_applauds * 1
--     score_community = LEAST(20, raw)
--
--   score_total: clamp 0..100 of (score_auto + new_forecast + new_community
--                                 + audit_buffer)
--     audit_buffer = GREATEST(0,
--                       prev.score_total - prev.score_auto
--                                        - prev.score_forecast
--                                        - prev.score_community)
--   The audit_buffer captures whatever delta the Edge Function's Y-fix put on
--   top of raw pillar sums (Claude qualitative score / walk-on floor). Carrying
--   it forward means engagement-driven updates never regress the post-audit
--   floor — they only add to it. At the next analyze-project run the total is
--   reset wholesale, so audit_buffer can never accumulate stale lift.
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
  v_audit_buffer int;
  v_total        int;
BEGIN
  SELECT creator_id, score_auto,
         GREATEST(0, score_total - score_auto - score_forecast - score_community)
    INTO v_creator_id, v_score_auto, v_audit_buffer
    FROM projects
   WHERE id = p_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Forecast: votes excluding self-vote.
  SELECT COALESCE(COUNT(DISTINCT v.member_id), 0),
         COALESCE(SUM(v.vote_count), 0)
    INTO v_unique_voters, v_total_votes
    FROM votes v
   WHERE v.project_id = p_id
     AND (v_creator_id IS NULL OR v.member_id <> v_creator_id);

  v_forecast := LEAST(30, v_unique_voters * 2 + LEAST(v_total_votes, 30));

  -- Community: human comments + product applauds, excluding self
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

  -- Total: pillars + preserved audit buffer
  v_total := LEAST(100, GREATEST(0, v_score_auto + v_forecast + v_community + v_audit_buffer));

  -- Tell enforce_project_owner_update_scope to let the 3 engagement-pillar
  -- columns through. Transaction-local (3rd arg = true) so the flag self-
  -- expires when this statement returns, even on rollback.
  PERFORM set_config('app.allow_pillar_update', 'true', true);

  UPDATE projects
     SET score_forecast = v_forecast,
         score_community = v_community,
         score_total = v_total
   WHERE id = p_id;

  -- Reset immediately so any subsequent UPDATE in the same transaction
  -- (e.g. analyze-project's own write path) doesn't piggy-back the bypass.
  PERFORM set_config('app.allow_pillar_update', 'false', true);
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- enforce_project_owner_update_scope · widen the bypass
-- ───────────────────────────────────────────────────────────────────────────
-- The existing trigger pinned score_forecast/community/total to OLD values
-- whenever the caller wasn't service_role. That worked when only the Edge
-- Function (service_role JWT) updated scores. Now recalc_pillar_scores fires
-- from regular DB triggers (votes/applauds/comments) — runs as the SQL user,
-- not service_role — so its writes were silently rolled back by this very
-- guard.
--
-- Fix: add a second bypass that recalc_pillar_scores explicitly opts into
-- via the session-local `app.allow_pillar_update` GUC. The opt-in is narrow:
-- it ONLY allows the 3 engagement-pillar columns through. score_auto / LH /
-- verdict / claude_insight / grade / etc. stay pinned exactly as before, so
-- the original anti-tampering invariants hold.
CREATE OR REPLACE FUNCTION public.enforce_project_owner_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  is_claim boolean;
  is_pillar_recalc boolean;
begin
  -- Service role bypass (Edge Function · analyze-project etc.)
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- Engagement-pillar recalc bypass (recalc_pillar_scores opts in via GUC)
  is_pillar_recalc := current_setting('app.allow_pillar_update', true) = 'true';

  -- Claim case · OLD row is an unowned CLI preview, NEW row is the
  -- authenticated user taking ownership.
  is_claim := old.creator_id IS NULL
          AND old.status      = 'preview'
          AND new.creator_id  = auth.uid()
          AND new.status      = 'active';

  if not is_claim then
    new.creator_id    := old.creator_id;
    new.creator_email := old.creator_email;
    new.status        := old.status;
  end if;

  -- Always-locked immutables
  new.season_id         := old.season_id;
  new.season            := old.season;
  new.created_at        := old.created_at;

  -- Analysis-owned (service_role writes via Edge Function · pillar recalc
  -- writes 3 of these via the GUC-gated path)
  new.score_auto        := old.score_auto;
  if not is_pillar_recalc then
    new.score_forecast    := old.score_forecast;
    new.score_community   := old.score_community;
    new.score_total       := old.score_total;
  end if;
  new.lh_performance    := old.lh_performance;
  new.lh_accessibility  := old.lh_accessibility;
  new.lh_best_practices := old.lh_best_practices;
  new.lh_seo            := old.lh_seo;
  new.github_accessible := old.github_accessible;
  new.unlock_level      := old.unlock_level;
  new.verdict           := old.verdict;
  new.claude_insight    := old.claude_insight;
  new.last_analysis_at  := old.last_analysis_at;

  -- Grade + graduation state
  new.creator_grade     := old.creator_grade;
  new.graduation_grade  := old.graduation_grade;
  new.graduated_at      := old.graduated_at;
  new.media_published_at := old.media_published_at;

  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Trigger functions · one per source table, fanning into recalc_pillar_scores.
-- We use AFTER triggers because we want the row to already be (in/out)serted
-- before we count.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_votes_recalc()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_pillar_scores(OLD.project_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND NEW.project_id <> OLD.project_id THEN
    PERFORM public.recalc_pillar_scores(OLD.project_id);
    PERFORM public.recalc_pillar_scores(NEW.project_id);
    RETURN NEW;
  ELSE
    PERFORM public.recalc_pillar_scores(NEW.project_id);
    RETURN NEW;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_applauds_product_recalc()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.target_type = 'product' THEN
      PERFORM public.recalc_pillar_scores(OLD.target_id);
    END IF;
    RETURN OLD;
  ELSE
    IF NEW.target_type = 'product' THEN
      PERFORM public.recalc_pillar_scores(NEW.target_id);
    END IF;
    -- Edge case: target_type changed (shouldn't really happen, but cover it)
    IF TG_OP = 'UPDATE'
       AND OLD.target_type = 'product'
       AND OLD.target_id <> NEW.target_id THEN
      PERFORM public.recalc_pillar_scores(OLD.target_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_comments_recalc()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.member_id IS NOT NULL THEN
      PERFORM public.recalc_pillar_scores(OLD.project_id);
    END IF;
    RETURN OLD;
  ELSE
    IF NEW.member_id IS NOT NULL THEN
      PERFORM public.recalc_pillar_scores(NEW.project_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Wire triggers · idempotent (drop+recreate)
-- ───────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_votes_recalc_pillars         ON public.votes;
CREATE TRIGGER trg_votes_recalc_pillars
  AFTER INSERT OR UPDATE OR DELETE ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.tg_votes_recalc();

DROP TRIGGER IF EXISTS trg_applauds_recalc_pillars      ON public.applauds;
CREATE TRIGGER trg_applauds_recalc_pillars
  AFTER INSERT OR UPDATE OR DELETE ON public.applauds
  FOR EACH ROW EXECUTE FUNCTION public.tg_applauds_product_recalc();

DROP TRIGGER IF EXISTS trg_comments_recalc_pillars      ON public.comments;
CREATE TRIGGER trg_comments_recalc_pillars
  AFTER INSERT OR UPDATE OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.tg_comments_recalc();

-- ───────────────────────────────────────────────────────────────────────────
-- Backfill · run recalc once for every project so existing engagement
-- (which until today never lifted scores) gets reflected.
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM projects LOOP
    PERFORM public.recalc_pillar_scores(r.id);
  END LOOP;
END;
$$;
