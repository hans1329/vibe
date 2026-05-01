-- ───────────────────────────────────────────────────────────────────────────
-- Notifications · comment kind
-- ───────────────────────────────────────────────────────────────────────────
-- Adds 'comment' to notifications.kind and a trigger that fires on every
-- comments INSERT.
--
-- Recipient resolution:
--   · Reply (parent_id IS NOT NULL) → notify the parent comment's author
--   · Top-level (parent_id IS NULL) → notify the project's creator
-- Skipped:
--   · System rows (member_id IS NULL · Stage Manager) — no actor to credit
--   · Self-notify (recipient = actor) — pointless ping
--   · Recipient missing / orphaned target row
--
-- Trigger is SECURITY DEFINER so it can write notifications regardless of
-- the inserting user's RLS scope. Wrapped in EXCEPTION to never block the
-- comment INSERT itself.
-- ───────────────────────────────────────────────────────────────────────────

-- [1] Extend the kind check to include 'comment'.
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('applaud', 'forecast', 'comment'));

-- [2] Trigger function.
create or replace function notify_comment_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_id uuid;
  v_project_id   uuid := new.project_id;
  v_is_reply     boolean := new.parent_id is not null;
begin
  -- Stage Manager inserts have no actor — skip the notification.
  if new.member_id is null then
    return new;
  end if;

  if v_is_reply then
    select member_id into v_recipient_id
      from comments where id = new.parent_id;
  else
    select creator_id into v_recipient_id
      from projects where id = v_project_id;
  end if;

  -- Skip self-notify, missing recipient, orphaned target.
  if v_recipient_id is null or v_recipient_id = new.member_id then
    return new;
  end if;

  begin
    insert into notifications (
      recipient_id, actor_id, kind, target_type, target_id, project_id, metadata
    )
    values (
      v_recipient_id,
      new.member_id,
      'comment',
      case when v_is_reply then 'comment_reply' else 'comment' end,
      new.id,
      v_project_id,
      jsonb_build_object(
        'is_reply', v_is_reply,
        'parent_id', new.parent_id,
        'preview', left(new.text, 140)
      )
    );
  exception when others then
    raise warning 'notify_comment_received failed for comment %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- [3] Trigger registration.
drop trigger if exists trg_notify_comment on comments;
create trigger trg_notify_comment
  after insert on comments
  for each row
  execute function notify_comment_received();
