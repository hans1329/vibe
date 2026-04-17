-- debut.show · Supabase Schema v1
-- Run this in Supabase Dashboard → SQL Editor

-- ── Projects table ───────────────────────────────────────────
create table if not exists projects (
  id                uuid default gen_random_uuid() primary key,
  created_at        timestamptz default now(),

  -- Creator info
  name              text not null,
  email             text not null,
  github_url        text,
  live_url          text,
  description       text,

  -- Build Brief Phase 1 (public during season)
  brief_problem     text,
  brief_features    text,
  brief_tools       text,
  brief_target      text,

  -- Build Brief Phase 2 (unlocked after graduation)
  brief_strategy    text,
  brief_fix         text,
  brief_delegation  jsonb,

  -- Lighthouse scores
  lh_performance    integer default 0,
  lh_accessibility  integer default 0,
  lh_best_practices integer default 0,
  lh_seo            integer default 0,

  -- Analysis flags
  github_accessible boolean default false,

  -- Scores (0-100 composite)
  score_auto        integer default 0,   -- 50% weight
  score_forecast    integer default 0,   -- 30% weight
  score_community   integer default 1,   -- 20% weight
  score_total       integer default 0,

  -- Creator grade & AI output
  creator_grade     text default 'Rookie',
  verdict           text,
  claude_insight    text,
  tech_layers       text[],

  -- League state
  unlock_level      integer default 0,   -- 0=initial, 3=code, 5=security, 10=prod, 20=deep
  status            text default 'active', -- active | graduated | valedictorian | retry
  graduation_grade  text,                -- valedictorian | honors | graduate
  season            text default 'season_zero',

  -- Timestamps
  graduated_at      timestamptz,
  media_published_at timestamptz
);

-- ── Row Level Security ────────────────────────────────────────
alter table projects enable row level security;

create policy "Anyone can insert projects"
  on projects for insert
  with check (true);

create policy "Anyone can read projects"
  on projects for select
  using (true);

-- Only service role can update/delete (no client-side mutations)
create policy "Service role can update"
  on projects for update
  using (auth.role() = 'service_role');

-- ── Votes table ───────────────────────────────────────────────
create table if not exists votes (
  id          uuid default gen_random_uuid() primary key,
  created_at  timestamptz default now(),
  project_id  uuid references projects(id) on delete cascade,
  voter_email text,
  vote_count  integer default 1,
  weight      numeric default 1.0,  -- multiplier based on scout tier
  scout_tier  text default 'Bronze',
  season      text default 'season_zero'
);

alter table votes enable row level security;

create policy "Anyone can insert votes"
  on votes for insert with check (true);

create policy "Anyone can read votes"
  on votes for select using (true);

-- ── Indexes ───────────────────────────────────────────────────
create index if not exists idx_projects_season   on projects(season);
create index if not exists idx_projects_status   on projects(status);
create index if not exists idx_projects_created  on projects(created_at desc);
create index if not exists idx_votes_project     on votes(project_id);

-- ── Helpful view ─────────────────────────────────────────────
create or replace view project_feed as
  select
    p.*,
    coalesce(sum(v.vote_count * v.weight), 0) as weighted_votes
  from projects p
  left join votes v on v.project_id = p.id
  group by p.id
  order by p.created_at desc;
