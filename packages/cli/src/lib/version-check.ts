// CLI auto-update detection — npx caches the resolved package version
// for up to 24h+, so users running `npx commitshow audit` keep getting
// a stale binary even after we publish 0.2.X+1. Asking them to clear
// `~/.npm/_npx/` is a UX failure. Instead we check the npm registry
// in the background, cache the answer for 24h, and surface a single
// clear warning line + update command.
//
// We never block · never auto-update · just inform.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CACHE_DIR  = join(homedir(), '.commitshow')
const CACHE_PATH = join(CACHE_DIR, 'version-cache.json')
const TTL_MS     = 24 * 60 * 60 * 1000

interface VersionCache {
  checked_at: number
  latest:     string | null
}

function readCache(): VersionCache | null {
  if (!existsSync(CACHE_PATH)) return null
  try {
    const raw = readFileSync(CACHE_PATH, 'utf8')
    return JSON.parse(raw) as VersionCache
  } catch {
    return null
  }
}

function writeCache(c: VersionCache): void {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 })
    writeFileSync(CACHE_PATH, JSON.stringify(c), { mode: 0o600 })
  } catch {
    // Cache write failures are non-fatal — version check just runs
    // every invocation instead of once per 24h.
  }
}

/** Compare semver-ish strings · returns >0 if a > b, 0 if equal, <0 if a < b.
 *  Tolerates pre-release suffixes by ignoring them (best-effort, not full semver). */
function semverCompare(a: string, b: string): number {
  const pa = a.split('.').map(s => parseInt(s, 10) || 0)
  const pb = b.split('.').map(s => parseInt(s, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const ai = pa[i] ?? 0
    const bi = pb[i] ?? 0
    if (ai !== bi) return ai - bi
  }
  return 0
}

/** Fetch latest version from npm registry · returns null on any failure
 *  (offline · DNS · timeout · 404). Non-blocking — caller decides if it
 *  matters. 2s timeout cap so a slow registry doesn't gate the audit. */
async function fetchLatestFromNpm(packageName: string): Promise<string | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 2000)
    const res = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
      signal: ctrl.signal,
      headers: { accept: 'application/json' },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const j = await res.json() as { version?: string }
    return typeof j.version === 'string' ? j.version : null
  } catch {
    return null
  }
}

export interface VersionCheckResult {
  current:  string
  latest:   string | null
  outdated: boolean
}

/** Check whether the running CLI is the latest published version.
 *  Hits cache first (24h TTL) · falls back to npm registry GET.
 *  Returns synchronously-ish from cache · async-fetches in the background
 *  ONLY when cache is stale.
 *
 *  Caller pattern:
 *    const ck = await checkLatestVersion('commitshow', '0.2.9')
 *    if (ck.outdated) console.error(formatUpdateBanner(ck))
 */
export async function checkLatestVersion(
  packageName: string,
  currentVersion: string,
): Promise<VersionCheckResult> {
  const cache = readCache()
  const fresh = cache && (Date.now() - cache.checked_at) < TTL_MS
  let latest: string | null = fresh ? (cache?.latest ?? null) : null

  if (!fresh) {
    latest = await fetchLatestFromNpm(packageName)
    if (latest) writeCache({ checked_at: Date.now(), latest })
  }

  const outdated = !!(latest && semverCompare(currentVersion, latest) < 0)
  return { current: currentVersion, latest, outdated }
}

/** Single-line warning banner for stale-CLI users. Goes to stderr so
 *  it doesn't pollute --json stdout. */
export function formatUpdateBanner(ck: VersionCheckResult): string {
  if (!ck.outdated || !ck.latest) return ''
  const lines = [
    '',
    `⚠  A newer commitshow is available · ${ck.current} → ${ck.latest}`,
    `   Update with:  npm install -g commitshow@latest`,
    `   Or run once:  npx commitshow@latest <command>`,
    `   (npx caches the binary for ~24h · @latest forces a fresh resolve)`,
    '',
  ]
  return lines.join('\n')
}
