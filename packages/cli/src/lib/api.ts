// Minimal Supabase REST client — no SDK, no dependencies.
//
// Design choice (CLAUDE.md §15-C.4): ship as a thin fetch wrapper to stay
// under the 1 MB bundle budget. We only hit PostgREST + Edge Functions, so
// the full @supabase/supabase-js isn't worth the weight.
//
// Anon-key access is enough for V0.1:
//   · projects (public read)
//   · analysis_snapshots (public read)
//   · season_standings view (public read)
// Write paths (submit / link / install with PR) require a member JWT and
// will be enabled when the device-flow endpoint lands.

import { readConfig } from './config.js'

// Baked-in defaults for the official commit.show instance. Self-hosters can
// override via `base_url` in ~/.commitshow/config.json.
const DEFAULT_BASE_URL  = 'https://tekemubwihsjdzittoqf.supabase.co'
const DEFAULT_ANON_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRla2VtdWJ3aWhzamR6aXR0b3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MzQ1NzUsImV4cCI6MjA5MjAxMDU3NX0.n2K-3lFVvlXQx-bV9evdNRSQCtG5oC4uQushxB2ja9Y'

function baseUrl(): string {
  return readConfig().base_url ?? DEFAULT_BASE_URL
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const cfg = readConfig()
  return {
    apikey:        DEFAULT_ANON_KEY,
    Authorization: `Bearer ${cfg.token ?? DEFAULT_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${baseUrl()}/rest/v1${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers as Record<string, string> ?? {}) },
  })
  if (!res.ok) throw new Error(`API ${res.status} on ${path}: ${await res.text()}`)
  return res.json() as Promise<T>
}

// ── Domain types (narrow subset, just what the CLI renders) ─────────

export interface ProjectRow {
  id:              string
  project_name:    string
  github_url:      string | null
  live_url:        string | null
  score_total:     number
  score_auto:      number
  score_forecast:  number
  score_community: number
  status:          string
  creator_name:    string | null
  creator_grade:   string | null
  last_analysis_at: string | null
}

export interface ScoutBriefItem { axis?: string; bullet?: string }
export interface SnapshotRow {
  id:                   string
  project_id:           string
  created_at:           string
  trigger_type:         string
  score_total:          number
  score_auto:           number
  score_forecast:       number
  score_community:      number
  score_total_delta:    number | null
  rich_analysis:        {
    scout_brief?: {
      strengths?:  ScoutBriefItem[]
      weaknesses?: ScoutBriefItem[]
    }
    tldr?: string
    headline?: string
  } | null
}

export interface StandingRow {
  project_id:      string
  rank:            number
  total_in_season: number
  percentile:      number
  projected_tier:  string | null
  score_total:     number
}

// ── Lookups ──────────────────────────────────────────────────────────

// PostgREST rejects `SELECT *` when anon has per-column grants (our email-privacy
// migration · §18.2). We enumerate the public columns we actually render.
const PROJECT_COLS =
  'id,project_name,github_url,live_url,score_total,score_auto,score_forecast,' +
  'score_community,status,creator_name,creator_grade,last_analysis_at'

/** Find a project by its canonical GitHub URL. Returns the first match or null. */
export async function findProjectByGithubUrl(url: string): Promise<ProjectRow | null> {
  // DB stores some URLs with .git or trailing slash · match loosely with ilike on owner/repo.
  const canonical = url.replace(/\.git$/, '').replace(/\/+$/, '')
  const ilikePattern = `${canonical.replace(/\*/g, '')}%`
  const rows = await rest<ProjectRow[]>(
    `/projects?select=${PROJECT_COLS}&github_url=ilike.${encodeURIComponent(ilikePattern)}&limit=1`,
  )
  return rows[0] ?? null
}

export async function findProjectById(id: string): Promise<ProjectRow | null> {
  const rows = await rest<ProjectRow[]>(`/projects?select=${PROJECT_COLS}&id=eq.${id}&limit=1`)
  return rows[0] ?? null
}

export async function fetchLatestSnapshot(projectId: string): Promise<SnapshotRow | null> {
  const rows = await rest<SnapshotRow[]>(
    `/analysis_snapshots?project_id=eq.${projectId}&order=created_at.desc&limit=1`,
  )
  return rows[0] ?? null
}

export async function fetchStanding(projectId: string): Promise<StandingRow | null> {
  const rows = await rest<StandingRow[]>(`/season_standings?project_id=eq.${projectId}&limit=1`)
  return rows[0] ?? null
}

// ── Trigger reaudit (requires member token · V1 backend) ─────────────

export async function triggerReaudit(projectId: string): Promise<SnapshotRow> {
  const cfg = readConfig()
  if (!cfg.token) {
    throw new Error('Re-audit requires login. Run `commitshow login` once device-flow is available.')
  }
  const res = await fetch(`${baseUrl()}/functions/v1/analyze-project`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ project_id: projectId, trigger_type: 'resubmit' }),
  })
  if (!res.ok) throw new Error(`Re-audit failed: ${res.status} · ${await res.text()}`)
  return res.json() as Promise<SnapshotRow>
}
