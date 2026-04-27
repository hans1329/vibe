-- members.is_admin · admin role for the /admin dashboard.
-- Designate first admin: 1@1.com (development/seed account).

alter table members
  add column if not exists is_admin boolean not null default false;

-- Index for the admin gate query (cheap · few rows expected to be true).
create index if not exists members_is_admin_idx on members(is_admin) where is_admin = true;

-- Seed 1@1.com as the first admin. Match by auth.users.email since
-- members.email may be empty under the privacy-grant migration (§18.2).
update members
   set is_admin = true
 where id = (select id from auth.users where email = '1@1.com' limit 1);

-- Public read of is_admin flag — needed by the client to gate /admin.
-- Other PII (email, etc.) stays gated by the existing per-column grants.
grant select (is_admin) on members to anon, authenticated;

-- RLS: allow client to read own row's is_admin (already covered by
-- existing read policies), and any logged-in user can read other
-- members' is_admin flag (it's not sensitive — knowing someone is an
-- admin is useful UX, not a leak).
do $$
begin
  if not exists (select 1 from pg_policy where polname = 'members_read_is_admin' and polrelid = 'members'::regclass) then
    create policy members_read_is_admin on members
      for select
      to anon, authenticated
      using (true);
  end if;
end$$;
