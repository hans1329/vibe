// Target detection — turns the CLI positional arg into a canonical
// { kind: 'remote-url', github_url } or { kind: 'local', path, github_url? }.
//
// Accepted inputs (all resolve to a GitHub HTTPS URL):
//   · (omitted)                         → cwd · read `git remote get-url origin`
//   · ./my-repo · /abs/path             → local dir · same remote inference
//   · github.com/owner/repo             → bare host shorthand
//   · https://github.com/owner/repo     → full URL
//   · git@github.com:owner/repo.git     → ssh form (common in `git remote`)
//   · owner/repo                        → last-ditch shorthand (2 segments, no dot)

import { execSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

export interface Target {
  kind: 'remote-url' | 'local'
  /** Canonical https://github.com/owner/repo — no trailing slash, no .git */
  github_url: string
  /** Only set when kind === 'local' */
  localPath?: string
  /** owner/repo convenience */
  slug: string
}

export class TargetError extends Error {}

const GITHUB_URL_RE = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i
const GITHUB_HOST_RE = /^github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i
const GITHUB_SSH_RE = /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i
const SLUG_RE = /^([A-Za-z0-9][\w.-]*)\/([A-Za-z0-9][\w.-]*)$/

function canonical(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo.replace(/\.git$/, '')}`
}

function matchUrl(raw: string): { owner: string; repo: string } | null {
  const s = raw.trim()
  const urlMatch = s.match(GITHUB_URL_RE) ?? s.match(GITHUB_HOST_RE) ?? s.match(GITHUB_SSH_RE)
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] }
  const slug = s.match(SLUG_RE)
  if (slug && !slug[2].includes('.')) return { owner: slug[1], repo: slug[2] }
  return null
}

function gitRemoteOrigin(cwd: string): string | null {
  try {
    const out = execSync('git remote get-url origin', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (!out) return null
    // Strip embedded userinfo (credentials) before parsing — safer and matches
    // how the canonical URL should look. e.g. https://x-access-token:ghp_…@github.com/foo/bar
    return out.replace(/^(https?:\/\/)[^@\/]+@/, '$1')
  } catch {
    return null
  }
}

export function resolveTarget(rawArg: string | undefined): Target {
  // 1 · Explicit URL forms
  if (rawArg) {
    const m = matchUrl(rawArg)
    if (m) {
      return {
        kind: 'remote-url',
        github_url: canonical(m.owner, m.repo),
        slug: `${m.owner}/${m.repo.replace(/\.git$/, '')}`,
      }
    }
  }

  // 2 · Local path (arg resolves to a directory) or cwd
  const path = resolve(rawArg ?? '.')
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new TargetError(
      `Not a repo I can audit: "${rawArg ?? path}".\n` +
      `  Expected: github URL, owner/repo shorthand, or a local git repo path.`,
    )
  }

  const remote = gitRemoteOrigin(path)
  if (!remote) {
    throw new TargetError(
      `No git remote found in ${path}.\n` +
      `  Either run this inside a git repo with a GitHub remote, or pass the URL directly:\n` +
      `    commitshow audit github.com/owner/repo`,
    )
  }

  const m = matchUrl(remote)
  if (!m) {
    // Don't echo `remote` — it may contain credentials. Ask for explicit target instead.
    throw new TargetError(
      `Couldn't parse the git remote for ${path} as a GitHub repo.\n` +
      `  commitshow currently supports GitHub-hosted projects only.\n` +
      `  Try passing the URL directly: commitshow audit github.com/owner/repo`,
    )
  }

  return {
    kind: 'local',
    github_url: canonical(m.owner, m.repo),
    localPath: path,
    slug: `${m.owner}/${m.repo.replace(/\.git$/, '')}`,
  }
}
