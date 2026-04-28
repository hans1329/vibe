// useRecentAudits — fetches the **highest-scoring audits across the
// platform** (any status, any time) for the CLI demo section so the hero
// terminal cycles through proven projects rather than time-windowed recency.
// Name kept for backwards compatibility — pool semantics changed.
//
// Why score-ranked instead of time-ranked: a 7-day recency window often
// produced a tiny pool (or all walk-ons of dubious quality). Ranking by
// score puts our strongest evaluations on the front page — which is what
// a vibe-coder actually wants to see ("here's what an 84 looks like").
//
// Pool query:
//   - score_total >= 70  (demo-quality floor — "strong" or near-strong)
//   - has scout_brief.strengths[] (>= 2) and weaknesses[] (>= 1) so
//     the rendered transcript reads as a real audit
//   - project_name length <= 24 (won't break terminal width)
//   - status: any (walk-ons + auditioning + graduated · all auditable)
//   - order by score_total DESC, take top 13 after dedupe by project_id
//
// Falls back to a hardcoded shadcn-ui/ui demo if the pool is empty,
// API fails, or RLS blocks the read. The HeroTerminal component owns
// the fallback shape so we keep the lib small + framework-agnostic.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export interface AuditDemo {
  projectName: string
  slug:        string                // "owner/repo" for the prompt line
  score:       number                // walk-on /100 — used in big digit
  band:        'strong' | 'mid' | 'weak'
  auditPts:    number                // raw 0-45 audit pillar
  strengths:   string[]              // up to 3
  concerns:    string[]              // up to 2
}

interface RawSnapshot {
  project_id:     string
  score_total:    number
  score_auto:     number
  rich_analysis:  {
    scout_brief?: {
      strengths?:  Array<{ axis?: string | null; bullet?: string } | string>
      weaknesses?: Array<{ axis?: string | null; bullet?: string } | string>
    }
  } | null
  projects: {
    project_name: string
    github_url:   string | null
    status:       string
  } | null
}

const POOL_TTL_MS = 60_000

function bandFor(score: number): 'strong' | 'mid' | 'weak' {
  if (score >= 75) return 'strong'
  if (score >= 50) return 'mid'
  return 'weak'
}

function asBullet(item: unknown): string | null {
  if (typeof item === 'string') return item.trim() || null
  if (item && typeof item === 'object') {
    const r = item as { bullet?: unknown; finding?: unknown; text?: unknown }
    const v = r.bullet ?? r.finding ?? r.text ?? null
    return typeof v === 'string' ? v.trim() || null : null
  }
  return null
}

function slugFromGithub(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/github\.com[:/]([^/\s?#]+)\/([^/\s?#]+?)(?:\.git)?\/?(?:[?#]|$)/i)
  if (!m) return null
  return `${m[1]}/${m[2]}`
}

function shortenBullet(s: string, max = 56): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'
}

let memoCache: { ts: number; demos: AuditDemo[] } | null = null

export async function fetchRecentAuditDemos(): Promise<AuditDemo[]> {
  if (memoCache && Date.now() - memoCache.ts < POOL_TTL_MS) {
    return memoCache.demos
  }
  const { data, error } = await supabase
    .from('analysis_snapshots')
    .select(`
      project_id, score_total, score_auto, rich_analysis,
      projects!inner(project_name, github_url, status)
    `)
    .gte('score_total', 70)
    .order('score_total', { ascending: false })
    .limit(80)                                              // wider — dedupe + brief gates trim it
  if (error || !data) return []

  // Dedupe by project_id keeping the FIRST encountered (= top-scoring
  // snapshot per project, since query is ordered score_total DESC).
  // Without this, a project audited 5 times in a row showed up 5 times in
  // the rotation with each snapshot's score (e.g. supabase 76/84/76/80/82).
  const seenProjects = new Set<string>()
  const demos: AuditDemo[] = []
  for (const raw of data as unknown as RawSnapshot[]) {
    if (seenProjects.has(raw.project_id)) continue
    const proj = raw.projects
    if (!proj)                                            continue
    if (!proj.project_name || proj.project_name.length > 24) continue

    const slug = slugFromGithub(proj.github_url)
    if (!slug)                                            continue

    const sBrief = raw.rich_analysis?.scout_brief
    const strengths = (sBrief?.strengths ?? [])
      .map(asBullet).filter((s): s is string => !!s).slice(0, 3).map(s => shortenBullet(s))
    const concerns = (sBrief?.weaknesses ?? [])
      .map(asBullet).filter((s): s is string => !!s).slice(0, 2).map(s => shortenBullet(s))
    if (strengths.length < 2 || concerns.length < 1) continue   // not demo-worthy

    seenProjects.add(raw.project_id)
    demos.push({
      projectName: proj.project_name,
      slug,
      score:       raw.score_total,
      band:        bandFor(raw.score_total),
      auditPts:    raw.score_auto,
      strengths,
      concerns,
    })
    if (demos.length >= 13) break                           // top-13 leaderboard
  }

  memoCache = { ts: Date.now(), demos }
  return demos
}

/** React hook · returns the demo pool. Initially [], populates async.
 *  Empty array means consumer should use its hardcoded fallback. */
export function useRecentAudits(): AuditDemo[] {
  const [demos, setDemos] = useState<AuditDemo[]>([])
  useEffect(() => {
    let live = true
    fetchRecentAuditDemos().then(d => {
      if (live) setDemos(d)
    }).catch(() => { /* silent · consumer falls back */ })
    return () => { live = false }
  }, [])
  return demos
}
