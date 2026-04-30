-- §11-NEW.2 · ladder_streaks compute function + daily cron.
-- Walks ladder_rankings_mv, places each ranked project into a top_N
-- bucket (1 / 10 / 50 / 100), upserts ladder_streaks with a 3-day
-- grace period · keeps longest_top_n + longest_streak_days +
-- total_days_in_top_50 monotonically updated.
--
-- Already applied to prod (function defined + cron 'streak-daily-compute'
-- scheduled at 02:00 UTC + initial seed run). Captured here for replay.

CREATE OR REPLACE FUNCTION compute_ladder_streaks_all_time()
RETURNS void AS $f$
DECLARE
  r record;
  v_top_n int;
  v_existing record;
  v_days int;
BEGIN
  FOR r IN
    SELECT project_id, category, rank_all_time
      FROM ladder_rankings_mv
     WHERE rank_all_time IS NOT NULL
  LOOP
    v_top_n :=
      CASE WHEN r.rank_all_time = 1   THEN 1
           WHEN r.rank_all_time <= 10 THEN 10
           WHEN r.rank_all_time <= 50 THEN 50
           WHEN r.rank_all_time <= 100 THEN 100
           ELSE NULL
      END;
    IF v_top_n IS NULL THEN CONTINUE; END IF;

    SELECT * INTO v_existing
      FROM ladder_streaks
     WHERE project_id = r.project_id
       AND category   = r.category
       AND time_window = 'all_time';

    IF v_existing IS NULL THEN
      INSERT INTO ladder_streaks (
        project_id, category, time_window,
        current_streak_start, current_top_n,
        longest_streak_days, longest_top_n,
        total_days_in_top_50, last_calculated_at
      ) VALUES (
        r.project_id, r.category, 'all_time',
        now(), v_top_n,
        0, v_top_n,
        CASE WHEN v_top_n <= 50 THEN 1 ELSE 0 END, now()
      );
    ELSE
      -- 3-day grace · brief drop out of top_N + re-entry doesn't reset
      IF v_existing.last_calculated_at < now() - interval '3 days' THEN
        UPDATE ladder_streaks
           SET current_streak_start = now(),
               current_top_n        = v_top_n,
               last_calculated_at   = now()
         WHERE id = v_existing.id;
      ELSE
        v_days := EXTRACT(DAY FROM (now() - v_existing.current_streak_start))::int;
        UPDATE ladder_streaks
           SET current_top_n        = LEAST(COALESCE(v_existing.current_top_n, v_top_n), v_top_n),
               longest_top_n        = LEAST(COALESCE(v_existing.longest_top_n, v_top_n), v_top_n),
               longest_streak_days  = GREATEST(v_existing.longest_streak_days, v_days),
               total_days_in_top_50 = v_existing.total_days_in_top_50
                 + (CASE WHEN v_top_n <= 50
                              AND v_existing.last_calculated_at < now() - interval '20 hours'
                         THEN 1 ELSE 0 END),
               last_calculated_at   = now()
         WHERE id = v_existing.id;
      END IF;
    END IF;
  END LOOP;
END;
$f$ LANGUAGE plpgsql SECURITY DEFINER;

-- Daily cron at 02:00 UTC · MV refreshes settle by then.
-- pg_cron schedule is idempotent at the function level (same job name
-- replaces); manual re-runs of this migration won't duplicate.
SELECT cron.unschedule('streak-daily-compute') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'streak-daily-compute'
);
SELECT cron.schedule(
  'streak-daily-compute',
  '0 2 * * *',
  'SELECT compute_ladder_streaks_all_time()'
);
