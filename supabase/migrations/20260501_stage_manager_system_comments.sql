-- ───────────────────────────────────────────────────────────────────────────
-- Stage Manager · system comments
-- ───────────────────────────────────────────────────────────────────────────
-- Adds a 'system' kind to the comments table so the Stage Manager (an in-app
-- agent identity) can post timeline notes inside each project's comment
-- thread. Events covered in V1:
--   · registered     — fires once when a project is first inserted
--   · score_jump     — fires on every analysis_snapshots INSERT where
--                      |score_total_delta| ≥ 6 (threshold deliberately low
--                      while traffic is small; raise later as posts pile up)
--   · graduated      — fires when projects.graduation_grade transitions from
--                      NULL → ('valedictorian'|'honors'|'graduate')
--
-- Greetings are picked randomly from a per-event pool so the thread doesn't
-- read like a printer log. Threshold + greeting pool can be edited in this
-- file later — change is one CREATE OR REPLACE FUNCTION.
--
-- All trigger functions are SECURITY DEFINER so they bypass RLS for the
-- INSERT into comments (member_id is NULL for system rows; the existing
-- "Auth users insert own comments" policy would otherwise block them).
--
-- Backfill: a one-shot DO block at the bottom inserts a 'registered' system
-- comment for every existing project that doesn't already have one, dating
-- the comment to the project's created_at so the thread reads in chronological
-- order. Past score_jump backfill is skipped on purpose — would spam old
-- threads · can be added later if useful.
-- ───────────────────────────────────────────────────────────────────────────

-- [1] Comment kind + event metadata columns
alter table comments
  add column if not exists kind        text default 'human'
    check (kind in ('human','system')),
  add column if not exists event_kind  text,
  add column if not exists event_meta  jsonb;

create index if not exists idx_comments_project_kind
  on comments(project_id, kind, created_at desc);

-- [2] RLS allowance — keep the existing human-insert policy (auth.uid() =
-- member_id), and rely on SECURITY DEFINER trigger functions for system
-- inserts. No new INSERT policy needed; system rows go in via DEFINER.

-- ───────────────────────────────────────────────────────────────────────────
-- [3] registered · fires on projects INSERT
-- ───────────────────────────────────────────────────────────────────────────
create or replace function stage_manager_on_project_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  msg text;
begin
  msg := case (floor(random() * 10))::int
    when 0 then 'This build stepped on stage. First audit underway.'
    when 1 then 'Welcome to the audition. Audit results posting in real time.'
    when 2 then 'New entry on the ladder. The engine is reading the repo now.'
    when 3 then 'Lights up. This build just took the stage.'
    when 4 then 'Curtain''s up. First round audit running.'
    when 5 then 'On stage. Audit booting up.'
    when 6 then 'A new audition. The engine has the repo.'
    when 7 then 'New build, new round. Engine spinning up.'
    when 8 then 'Stepped on stage. First read incoming.'
    else        'Auditioning now. Stand by for the first round.'
  end;

  begin
    insert into comments (project_id, member_id, text, kind, event_kind, event_meta)
    values (NEW.id, null, msg, 'system', 'registered',
            jsonb_build_object('initial_score', NEW.score_total));
  exception when others then
    -- Never block project creation on a Stage Manager hiccup.
    raise warning 'stage_manager registered comment failed for project %: %', NEW.id, sqlerrm;
  end;

  return NEW;
end$$;

drop trigger if exists trg_stage_manager_project_created on projects;
create trigger trg_stage_manager_project_created
  after insert on projects
  for each row execute function stage_manager_on_project_created();

-- ───────────────────────────────────────────────────────────────────────────
-- [4] score_jump · fires on analysis_snapshots INSERT when |delta| ≥ 6
-- ───────────────────────────────────────────────────────────────────────────
create or replace function stage_manager_on_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta_val int := NEW.score_total_delta;
  abs_delta int;
  rounds    int;
  msg       text;
begin
  if delta_val is null then
    return NEW;
  end if;

  abs_delta := abs(delta_val);
  if abs_delta < 6 then
    return NEW;
  end if;

  select count(*) into rounds
    from analysis_snapshots
    where project_id = NEW.project_id;

  if delta_val > 0 then
    msg := case (floor(random() * 7))::int
      when 0 then 'Round ' || rounds::text || ' audit: score climbed +' || delta_val::text
                  || ' to ' || NEW.score_total::text || '. Real movement.'
      when 1 then 'Up +' || delta_val::text || ' this round. Now at '
                  || NEW.score_total::text || '/100.'
      when 2 then 'Round ' || rounds::text || ': +' || delta_val::text
                  || '. Score reads ' || NEW.score_total::text || '.'
      when 3 then 'Audit moved +' || delta_val::text
                  || '. Concerns dropping faster than strengths appearing.'
      when 4 then 'Score is on the climb: ' || NEW.score_total::text
                  || '/100 (+' || delta_val::text || ').'
      when 5 then '+' || delta_val::text || ' this round. ' || NEW.score_total::text
                  || '/100. Worth re-reading the report.'
      else        'Audit posted +' || delta_val::text || '. Now '
                  || NEW.score_total::text || '. Round ' || rounds::text || '.'
    end;
  else
    msg := case (floor(random() * 7))::int
      when 0 then 'Round ' || rounds::text || ' audit: score moved ' || delta_val::text
                  || ' to ' || NEW.score_total::text || '. New concerns flagged.'
      when 1 then 'Down ' || abs_delta::text || ' this round. Now at '
                  || NEW.score_total::text || '/100. Worth a look.'
      when 2 then 'Round ' || rounds::text || ': ' || delta_val::text
                  || '. Audit found something new.'
      when 3 then 'Score shifted ' || delta_val::text
                  || '. The report has the details.'
      when 4 then 'Score now ' || NEW.score_total::text || ' (' || delta_val::text
                  || '). New entries in concerns.'
      when 5 then delta_val::text || ' this round. ' || NEW.score_total::text
                  || '/100. Audit caught something.'
      else        'Round ' || rounds::text || ' delta: ' || delta_val::text
                  || '. Re-check the report.'
    end;
  end if;

  begin
    insert into comments (project_id, member_id, text, kind, event_kind, event_meta)
    values (NEW.project_id, null, msg, 'system', 'score_jump',
            jsonb_build_object(
              'delta',       delta_val,
              'score_total', NEW.score_total,
              'round',       rounds
            ));
  exception when others then
    raise warning 'stage_manager score_jump comment failed for snapshot %: %', NEW.id, sqlerrm;
  end;

  return NEW;
end$$;

drop trigger if exists trg_stage_manager_snapshot on analysis_snapshots;
create trigger trg_stage_manager_snapshot
  after insert on analysis_snapshots
  for each row execute function stage_manager_on_snapshot();

-- ───────────────────────────────────────────────────────────────────────────
-- [5] graduated · fires when graduation_grade flips from NULL → set
-- ───────────────────────────────────────────────────────────────────────────
create or replace function stage_manager_on_graduation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  msg text;
begin
  if NEW.graduation_grade is null then
    return NEW;
  end if;
  if OLD.graduation_grade is not null and OLD.graduation_grade = NEW.graduation_grade then
    return NEW;
  end if;
  if NEW.graduation_grade not in ('valedictorian','honors','graduate') then
    return NEW;
  end if;

  if NEW.graduation_grade = 'valedictorian' then
    msg := case (floor(random() * 4))::int
      when 0 then 'Valedictorian. Hall of Fame entry permanent. Season ' || coalesce(NEW.season::text, 'Zero') || '.'
      when 1 then 'Valedictorian of Season ' || coalesce(NEW.season::text, 'Zero') || '. The build is now permanent record.'
      when 2 then 'Top of the season. Valedictorian for Season ' || coalesce(NEW.season::text, 'Zero') || '.'
      else        'Valedictorian. Final score ' || NEW.score_total::text || '/100. Hall of Fame.'
    end;
  elsif NEW.graduation_grade = 'honors' then
    msg := case (floor(random() * 4))::int
      when 0 then 'Honors graduation. Top 5% of Season ' || coalesce(NEW.season::text, 'Zero') || '. The build is in the archive.'
      when 1 then 'Honors. Top 5% of the season. Final score ' || NEW.score_total::text || '/100.'
      when 2 then 'Honors graduate of Season ' || coalesce(NEW.season::text, 'Zero') || '.'
      else        'Honors track. The build closes the season at ' || NEW.score_total::text || '/100.'
    end;
  else
    msg := case (floor(random() * 4))::int
      when 0 then 'Graduated. Top 20% of Season ' || coalesce(NEW.season::text, 'Zero') || '. Brief now public.'
      when 1 then 'Season ' || coalesce(NEW.season::text, 'Zero') || ' graduate. Final score ' || NEW.score_total::text || '/100.'
      when 2 then 'Graduated. The build moves to the archive.'
      else        'Graduate of Season ' || coalesce(NEW.season::text, 'Zero') || '.'
    end;
  end if;

  begin
    insert into comments (project_id, member_id, text, kind, event_kind, event_meta)
    values (NEW.id, null, msg, 'system', 'graduated',
            jsonb_build_object(
              'grade',       NEW.graduation_grade,
              'final_score', NEW.score_total,
              'season',      NEW.season
            ));
  exception when others then
    raise warning 'stage_manager graduated comment failed for project %: %', NEW.id, sqlerrm;
  end;

  return NEW;
end$$;

drop trigger if exists trg_stage_manager_graduation on projects;
create trigger trg_stage_manager_graduation
  after update of graduation_grade on projects
  for each row
  when (NEW.graduation_grade is distinct from OLD.graduation_grade)
  execute function stage_manager_on_graduation();

-- ───────────────────────────────────────────────────────────────────────────
-- [6] Backfill · one-shot 'registered' comment for every existing project
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  rec record;
  msg text;
begin
  for rec in
    select id, created_at, score_total
      from projects
      where not exists (
        select 1 from comments c
          where c.project_id = projects.id
            and c.kind = 'system'
            and c.event_kind = 'registered'
      )
  loop
    msg := case (floor(random() * 10))::int
      when 0 then 'This build stepped on stage. First audit underway.'
      when 1 then 'Welcome to the audition. Audit results posting in real time.'
      when 2 then 'New entry on the ladder. The engine is reading the repo now.'
      when 3 then 'Lights up. This build just took the stage.'
      when 4 then 'Curtain''s up. First round audit running.'
      when 5 then 'On stage. Audit booting up.'
      when 6 then 'A new audition. The engine has the repo.'
      when 7 then 'New build, new round. Engine spinning up.'
      when 8 then 'Stepped on stage. First read incoming.'
      else        'Auditioning now. Stand by for the first round.'
    end;

    insert into comments (project_id, member_id, text, kind, event_kind, event_meta, created_at)
    values (rec.id, null, msg, 'system', 'registered',
            jsonb_build_object('initial_score', rec.score_total, 'backfilled', true),
            rec.created_at);
  end loop;
end$$;
