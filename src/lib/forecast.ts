// Forecast vote logic — Scout casts a 0-100 projected graduation score on a project.
// DB triggers handle tier stamping, weight, AP grant, and monthly cap enforcement.

import { supabase } from './supabase'
import type { ScoutTier, MemberStats } from './supabase'

export interface CastForecastInput {
  projectId: string
  predictedScore: number      // 0-100 graduation projection
  comment?: string
  memberId: string
  seasonId?: string | null    // default: active season
}

export interface CastForecastResult {
  voteId: string
  weight: number
  scoutTier: ScoutTier
  apEarned: number            // base vote AP; bonuses resolve at graduation
}

export class ForecastQuotaError extends Error {
  tier: ScoutTier
  used: number
  cap: number
  constructor(message: string, tier: ScoutTier, used: number, cap: number) {
    super(message)
    this.name = 'ForecastQuotaError'
    this.tier = tier
    this.used = used
    this.cap = cap
  }
}

// AlreadyForecastedError removed 2026-05-03 · CEO confirmed PRD §1-A ① /
// §9 ×N "몰빵" stays — same Scout can cast multiple forecasts on the same
// project to express stronger conviction. Quota is throttled by the monthly
// ballot wallet (Bronze 20 / Silver 40 / Gold 60 / Platinum 80), not by a
// per-project gate. The votes_member_project_season_uq UNIQUE constraint
// was already dropped in 20260424_v2_prd_realignment.sql.

// Fetch the current live quarterly event id. §11-NEW.8 · was: seasons table.
// events.id == seasons.id (UUID preserved by Migration A), so the foreign
// keys on votes.season_id keep matching.
async function resolveActiveSeasonId(): Promise<string | null> {
  const { data } = await supabase
    .from('events')
    .select('id')
    .eq('template_type', 'quarterly')
    .eq('status', 'live')
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

export async function castForecast(input: CastForecastInput): Promise<CastForecastResult> {
  const seasonId = input.seasonId ?? await resolveActiveSeasonId()

  const { data, error } = await supabase
    .from('votes')
    .insert([{
      project_id: input.projectId,
      member_id: input.memberId,
      season_id: seasonId,
      predicted_score: Math.max(0, Math.min(100, Math.round(input.predictedScore))),
      comment: input.comment ?? null,
      vote_count: 1,
      // scout_tier and weight are overwritten by the BEFORE INSERT trigger.
    }])
    .select('id, weight, scout_tier')
    .single()

  if (error) {
    const msg = error.message || ''
    if (/Monthly vote cap reached/i.test(msg)) {
      // Trigger message format: "Monthly vote cap reached for tier X: used / cap"
      const m = msg.match(/tier (\w+):\s*(\d+)\s*\/\s*(\d+)/)
      if (m) {
        throw new ForecastQuotaError(msg, m[1] as ScoutTier, parseInt(m[2]), parseInt(m[3]))
      }
      throw new ForecastQuotaError(msg, 'Bronze', 0, 0)
    }
    throw error
  }

  return {
    voteId: data.id,
    weight: Number(data.weight),
    scoutTier: data.scout_tier as ScoutTier,
    apEarned: 10,   // mirrors the grant_ap(kind='vote', 10) rule in the DB trigger
  }
}

// Fetch the member_stats row for the given member so callers can render
// the Scout Status strip (tier · AP · monthly cap remaining).
export async function loadMemberStats(memberId: string): Promise<MemberStats | null> {
  const { data } = await supabase
    .from('member_stats')
    .select('*')
    .eq('id', memberId)
    .maybeSingle()
  return (data as MemberStats | null) ?? null
}

/**
 * How many forecasts the member has already cast on this project this
 * season. Returned as a count (not boolean) because PRD §9 allows ×N
 * casts — UI shows "You've cast 3 already · cast another?" rather than
 * gating after the first one.
 */
export async function priorForecastCount(memberId: string, projectId: string, seasonId?: string | null): Promise<number> {
  const effectiveSeason = seasonId ?? await resolveActiveSeasonId()
  const { count } = await supabase
    .from('votes')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .eq('project_id', projectId)
    .eq('season_id', effectiveSeason)
  return count ?? 0
}
