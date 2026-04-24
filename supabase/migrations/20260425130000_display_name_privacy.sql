-- ════════════════════════════════════════════════════════════════════════════
-- 20260425130000_display_name_privacy.sql
--
-- Two fixes that belong together:
--
--   1) Guarantee every member has a display_name (backfill NULLs from the
--      email prefix, auto-set on future signups via handle_new_user). After
--      this migration no UI fallback has to invent a name from scratch —
--      members.display_name is always populated.
--
--   2) Stop leaking other users' email addresses through public views:
--      md_library_feed and member_stats both projected `m.email` so any
--      unauthenticated REST query against those views could harvest the
--      full email list. Drop the column from both views. The base
--      members.email stays (authenticated users need to read their own
--      email) but it no longer flows through the public feeds.
--
-- Non-destructive · idempotent (trigger replace · view drop+recreate).
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Backfill members.display_name for legacy rows where it was null/blank.
--    Uses the email local-part so the name is recognizable (e.g. abc@1.com
--    → "abc"). Users can still override via /me EDIT.
-- ──────────────────────────────────────────────────────────────────────────
update members
   set display_name = split_part(email, '@', 1)
 where (display_name is null or btrim(display_name) = '')
   and email is not null;

-- 2. handle_new_user — on every auth.users insert, ensure the mirrored
--    members row carries a display_name. Prefer the raw_user_meta_data
--    hint if the signup flow set one, otherwise fall back to email prefix.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.members (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'display_name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. md_library_feed — drop m.email from the public projection.
--    The `ml.*` passthrough still carries intent / price / stats columns;
--    only author_email is removed. Everything else untouched.
-- ──────────────────────────────────────────────────────────────────────────
drop view if exists md_library_feed;
create view md_library_feed as
  select
    ml.*,
    m.display_name                           as author_name,
    -- m.email · removed 2026-04-25 privacy migration
    m.creator_grade                          as current_author_grade,
    m.avatar_url                             as author_avatar_url,
    p.project_name                           as source_project_name,
    p.score_total                            as source_project_score,
    p.status                                 as source_project_status,
    coalesce(ad.projects_applied,    0)      as projects_applied_count,
    coalesce(ad.projects_graduated,  0)      as projects_graduated_count,
    coalesce(ad.total_applications,  0)      as total_applications_count,
    (
      case m.creator_grade
        when 'Legend'        then 60
        when 'Vibe Engineer' then 40
        when 'Architect'     then 25
        when 'Maker'         then 15
        when 'Builder'       then 8
        else 0
      end
      + coalesce(ad.projects_graduated, 0) * 5
      + coalesce(ad.projects_applied,   0) * 2
      + ml.downloads_count                 * 1
      + case when ml.verified_badge then 10 else 0 end
    )                                        as reputation_score
  from md_library ml
  left join members m              on m.id      = ml.creator_id
  left join projects p             on p.id      = ml.linked_project_id
  left join md_library_adoption ad on ad.md_id  = ml.id
  where ml.status = 'published' and ml.is_public = true
  order by
    (
      case m.creator_grade
        when 'Legend'        then 60
        when 'Vibe Engineer' then 40
        when 'Architect'     then 25
        when 'Maker'         then 15
        when 'Builder'       then 8
        else 0
      end
      + coalesce(ad.projects_graduated, 0) * 5
      + coalesce(ad.projects_applied,   0) * 2
      + ml.downloads_count                 * 1
      + case when ml.verified_badge then 10 else 0 end
    ) desc,
    ml.created_at desc;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. member_stats — rebuild with the member columns enumerated explicitly
--    (no m.* passthrough) so email can't sneak back in when we add columns
--    to members later.
-- ──────────────────────────────────────────────────────────────────────────
drop view if exists member_stats;
create view member_stats as
  select
    m.id,
    -- m.email · removed 2026-04-25 privacy migration
    m.display_name,
    m.avatar_url,
    m.tier,
    m.activity_points,
    m.monthly_votes_used,
    m.votes_reset_at,
    m.creator_grade,
    m.total_graduated,
    m.avg_auto_score,
    m.created_at,
    m.updated_at,
    m.grade_recalc_at,
    m.preferred_stack,
    count(distinct p.id)                                                            as total_projects,
    count(distinct p.id) filter (where p.status in ('graduated','valedictorian'))   as graduated_count,
    count(distinct v.id)                                                            as total_votes_cast,
    count(distinct ap.id)                                                           as total_applauds_given,
    monthly_vote_cap(m.tier)                                                        as monthly_vote_cap,
    greatest(0, monthly_vote_cap(m.tier) - m.monthly_votes_used)                    as monthly_votes_remaining
  from members m
  left join projects p  on p.creator_id  = m.id
  left join votes v     on v.member_id   = m.id
  left join applauds ap on ap.member_id  = m.id
  group by m.id;

commit;
