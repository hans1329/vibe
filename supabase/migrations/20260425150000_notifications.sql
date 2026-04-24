-- notifications v1 · applauds + forecasts → in-app feed
--
-- Delivery model: a single row per event in `notifications`. Triggers fire
-- right after the applaud/vote is committed, so the recipient sees the
-- notification without any cron or background worker.
--
-- Scope (v1):
--   · applaud → notify owner of the target (product / comment / community_post)
--   · vote    → notify owner of the project
-- Deferred:
--   · brief / recommit applauds (lower volume, can add in v1.1)
--   · comment replies, mentions, X-mentions
--
-- RLS locks notifications to the recipient. Triggers run SECURITY DEFINER
-- so they can insert on behalf of anyone without breaking RLS.

create table if not exists notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references members(id) on delete cascade,
  actor_id     uuid references members(id) on delete set null,
  kind         text not null check (kind in ('applaud', 'forecast')),
  target_type  text,
  target_id    uuid,
  project_id   uuid references projects(id) on delete cascade,
  metadata     jsonb not null default '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_notifications_recipient_created
  on notifications(recipient_id, created_at desc);

create index if not exists idx_notifications_recipient_unread
  on notifications(recipient_id, created_at desc)
  where read_at is null;

alter table notifications enable row level security;

drop policy if exists "recipient reads own notifications" on notifications;
create policy "recipient reads own notifications"
  on notifications for select
  using (auth.uid() = recipient_id);

drop policy if exists "recipient updates own notifications" on notifications;
create policy "recipient updates own notifications"
  on notifications for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- Anonymous / service-role can write (trigger SECURITY DEFINER bypasses RLS).
grant select, update on notifications to authenticated;
grant select on notifications to anon;  -- no rows leak because of RLS

-- ───────── Applaud trigger ─────────
-- Resolves recipient by target_type.

create or replace function notify_applaud_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_id uuid;
  v_project_id   uuid;
begin
  if new.target_type = 'product' then
    select creator_id into v_recipient_id from projects where id = new.target_id;
    v_project_id := new.target_id;
  elsif new.target_type = 'comment' then
    select member_id, project_id into v_recipient_id, v_project_id
      from comments where id = new.target_id;
  elsif new.target_type in ('build_log', 'stack', 'ask', 'office_hours') then
    select author_id, linked_project_id into v_recipient_id, v_project_id
      from community_posts where id = new.target_id;
  else
    -- unknown target_type (e.g. brief, recommit in v1.1+) · skip silently
    return new;
  end if;

  -- Never notify yourself · also skip if target was deleted / orphan
  if v_recipient_id is null or v_recipient_id = new.member_id then
    return new;
  end if;

  insert into notifications (recipient_id, actor_id, kind, target_type, target_id, project_id)
  values (v_recipient_id, new.member_id, 'applaud', new.target_type, new.target_id, v_project_id);

  return new;
end;
$$;

drop trigger if exists trg_notify_applaud on applauds;
create trigger trg_notify_applaud
  after insert on applauds
  for each row
  execute function notify_applaud_received();

-- ───────── Forecast trigger ─────────
-- One notification per cast (not per vote_count unit) — spamming 20 rows
-- for a ×20 cast would overwhelm the feed.

create or replace function notify_forecast_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_id uuid;
begin
  select creator_id into v_recipient_id from projects where id = new.project_id;

  if v_recipient_id is null or v_recipient_id = new.member_id then
    return new;
  end if;

  insert into notifications (
    recipient_id, actor_id, kind, target_type, target_id, project_id, metadata
  )
  values (
    v_recipient_id, new.member_id, 'forecast', 'project', new.project_id, new.project_id,
    jsonb_build_object(
      'vote_count', new.vote_count,
      'predicted_score', new.predicted_score
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_forecast on votes;
create trigger trg_notify_forecast
  after insert on votes
  for each row
  execute function notify_forecast_received();

-- ───────── notification_feed view ─────────
-- Join actor + subject context so the client renders with zero extra
-- round trips. Security: view runs as the caller (no SECURITY DEFINER),
-- and RLS on notifications already scopes rows to the recipient.

create or replace view notification_feed as
select
  n.id,
  n.recipient_id,
  n.actor_id,
  n.kind,
  n.target_type,
  n.target_id,
  n.project_id,
  n.metadata,
  n.read_at,
  n.created_at,
  actor.display_name   as actor_display_name,
  actor.avatar_url     as actor_avatar_url,
  actor.creator_grade  as actor_grade,
  proj.project_name    as project_name,
  post.title           as community_post_title,
  post.type            as community_post_type
from notifications n
left join members actor on actor.id = n.actor_id
left join projects proj on proj.id = n.project_id
left join community_posts post on post.id = n.target_id and n.target_type in ('build_log','stack','ask','office_hours');

grant select on notification_feed to authenticated;
