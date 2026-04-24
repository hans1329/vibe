// Terminal render — the canonical output spec from CLAUDE.md §15-C.2.
//
// Optimized for:
//   · Fixed-width 58-col layout (fits ~700×500 screenshots on X)
//   · 3 strengths + 2 concerns asymmetry (§15-C.2 content contract)
//   · self-delta only (no peer-vs-peer drama in V0.1)
//   · .commitshow/audit.md side-effect for AI re-read loop

import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { c, scoreTone, deltaTone } from './colors.js'
import type { ProjectRow, SnapshotRow, StandingRow } from './api.js'

export interface AuditView {
  project:  ProjectRow
  snapshot: SnapshotRow | null
  standing: StandingRow | null
}

const BAR_WIDTH = 20

/** Single filled/empty bar for a 0..max score. */
function scoreBar(value: number, max: number): string {
  const filled = Math.max(0, Math.min(BAR_WIDTH, Math.round((value / max) * BAR_WIDTH)))
  const empty  = BAR_WIDTH - filled
  const tone   = scoreTone(Math.round((value / max) * 100))
  return tone('▰'.repeat(filled)) + c.muted('▱'.repeat(empty))
}

function pad(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length)
}

function centerPad(s: string, w: number): string {
  if (s.length >= w) return s.slice(0, w)
  const total = w - s.length
  const left  = Math.floor(total / 2)
  return ' '.repeat(left) + s + ' '.repeat(total - left)
}

/** Strip ANSI for width math on colored strings. */
function visibleLength(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

function asStringArray(raw: unknown, take: number): string[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, take).map(row => {
    if (typeof row === 'string') return row
    if (row && typeof row === 'object') {
      const r = row as Record<string, unknown>
      return String(r.bullet ?? r.finding ?? r.text ?? r.summary ?? r.title ?? '')
    }
    return ''
  }).filter(Boolean)
}

export function renderAudit(view: AuditView): string {
  const { project: p, snapshot, standing } = view
  const total = p.score_total ?? 0

  // Header
  const bar = '─'.repeat(58)
  const lines: string[] = []
  lines.push(c.muted('┌' + bar + '┐'))
  lines.push(c.muted('│ ') + c.bold(c.gold('commit.show')) + c.muted(' · ') + c.cream('Audit report') + ' '.repeat(58 - 29) + c.muted('│'))
  lines.push(c.muted('└' + bar + '┘'))
  lines.push('')

  // Project title line
  const name = p.project_name ?? 'untitled'
  const slug = p.github_url?.replace(/^https?:\/\//, '') ?? ''
  lines.push('  ' + c.bold(c.cream(name)) + '   ' + c.muted(slug))
  lines.push('')

  // Hero score card
  const scoreText = `${total} / 100`
  const scoreTinted = scoreTone(total)(scoreText)
  const cardW = 14
  lines.push('  ' + ' '.repeat(20) + c.muted('╔' + '═'.repeat(cardW) + '╗'))
  lines.push('  ' + ' '.repeat(20) + c.muted('║') + centerPadAnsi(scoreTinted, cardW) + c.muted('║'))
  lines.push('  ' + ' '.repeat(20) + c.muted('╚' + '═'.repeat(cardW) + '╝'))
  lines.push('')

  // 3-axis bars
  const auditLine     = `  Audit  ${pad(`${p.score_auto}/50`, 7)}  ${scoreBar(p.score_auto, 50)}`
  const scoutLine     = `  Scout  ${pad(`${p.score_forecast}/30`, 7)}  ${scoreBar(p.score_forecast, 30)}`
  const communityLine = `  Comm.  ${pad(`${p.score_community}/20`, 7)}  ${scoreBar(p.score_community, 20)}`
  lines.push('  ' + auditLine)
  lines.push('  ' + scoutLine)
  lines.push('  ' + communityLine)
  lines.push('')

  // 3 strengths + 2 concerns from scout_brief · §15-C.2 content contract.
  // Web surfaces the full 5+3; the CLI keeps it tight for terminal screenshots.
  const strengths = asStringArray(snapshot?.rich_analysis?.scout_brief?.strengths, 3)
  const concerns  = asStringArray(snapshot?.rich_analysis?.scout_brief?.weaknesses, 2)
  if (strengths.length > 0 || concerns.length > 0) {
    lines.push('  ' + c.muted('┌' + '─'.repeat(56) + '┐'))
    for (const s of strengths) {
      lines.push('  ' + c.muted('│ ') + c.teal('↑ ') + truncate(s, 52) + fill(s, 52) + c.muted(' │'))
    }
    for (const s of concerns) {
      lines.push('  ' + c.muted('│ ') + c.scarlet('↓ ') + truncate(s, 52) + fill(s, 52) + c.muted(' │'))
    }
    lines.push('  ' + c.muted('└' + '─'.repeat(56) + '┘'))
    lines.push('')
  }

  // Standings + delta
  if (standing) {
    const rank = `#${standing.rank} of ${standing.total_in_season}`
    const tier = standing.projected_tier ?? '—'
    const pct  = `(top ${Math.max(1, Math.round(standing.percentile))}%)`
    lines.push('  ' + c.muted('Ranked   ') + c.cream(pad(rank, 12)) + c.muted(`  season`))
    lines.push('  ' + c.muted('Tier     ') + c.gold(pad(tier, 12)) + c.muted(`  ${pct}`))
  }
  if (snapshot?.score_total_delta != null && snapshot.score_total_delta !== 0) {
    const d = snapshot.score_total_delta
    const sign = d > 0 ? '+' : ''
    lines.push('  ' + c.muted('Δ        ') + deltaTone(d)(pad(`${sign}${d}`, 12)) + c.muted(`  since last audit`))
  }
  lines.push('')

  // Footer URLs
  const url = `https://commit.show/projects/${p.id}`
  lines.push('  ' + c.muted('→ ') + c.cream(url))
  const footerPad = Math.max(0, 58 - 'commit.show'.length - 2)
  lines.push(' '.repeat(footerPad) + c.gold('commit.show'))

  return lines.join('\n')
}

function truncate(s: string, w: number): string {
  const vl = s.length
  if (vl <= w) return s
  return s.slice(0, w - 1) + '…'
}

function fill(s: string, w: number): string {
  return ' '.repeat(Math.max(0, w - Math.min(w, s.length)))
}

function centerPadAnsi(s: string, w: number): string {
  const vl = visibleLength(s).length
  if (vl >= w) return s
  const total = w - vl
  const left  = Math.floor(total / 2)
  return ' '.repeat(left) + s + ' '.repeat(total - left)
}

// ─────────── Markdown sibling for .commitshow/audit.md ───────────

export function renderMarkdown(view: AuditView): string {
  const { project: p, snapshot, standing } = view
  const strengths = asStringArray(snapshot?.rich_analysis?.scout_brief?.strengths, 3)
  const concerns  = asStringArray(snapshot?.rich_analysis?.scout_brief?.weaknesses, 2)
  const delta = snapshot?.score_total_delta

  const lines: string[] = []
  lines.push(`# commit.show · Audit report`)
  lines.push('')
  lines.push(`**${p.project_name}**`)
  if (p.github_url) lines.push(`_${p.github_url}_`)
  lines.push('')
  lines.push(`## Score · ${p.score_total} / 100`)
  lines.push('')
  lines.push(`- Audit:      ${p.score_auto}/50`)
  lines.push(`- Scout:      ${p.score_forecast}/30`)
  lines.push(`- Community:  ${p.score_community}/20`)
  if (delta != null && delta !== 0) {
    lines.push(`- **Δ ${delta > 0 ? '+' : ''}${delta}** since last audit`)
  }
  if (standing) {
    lines.push(`- Ranked #${standing.rank} of ${standing.total_in_season} — projected **${standing.projected_tier ?? '—'}** (top ${Math.round(standing.percentile)}%)`)
  }
  lines.push('')
  if (strengths.length > 0) {
    lines.push(`## Strengths`)
    for (const s of strengths) lines.push(`- ${s}`)
    lines.push('')
  }
  if (concerns.length > 0) {
    lines.push(`## Concerns`)
    for (const s of concerns) lines.push(`- ${s}`)
    lines.push('')
  }
  lines.push(`---`)
  lines.push(`Auditioned on commit.show · https://commit.show/projects/${p.id}`)
  lines.push('')
  return lines.join('\n')
}

/** Persist markdown side-effect to .commitshow/audit.md in the target dir. */
export function writeAuditMarkdown(dir: string | undefined, md: string): string | null {
  if (!dir) return null
  try {
    const cshow = join(dir, '.commitshow')
    if (!existsSync(cshow)) mkdirSync(cshow, { recursive: true })
    const path = join(cshow, 'audit.md')
    writeFileSync(path, md, 'utf8')
    return path
  } catch {
    return null
  }
}
