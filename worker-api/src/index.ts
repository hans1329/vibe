// Standalone Cloudflare Worker for api.commit.show.
//
// Routes:
//   GET  /audit?repo=<github-url>&format=md|json
//   POST /audit                  body { repo, format }
//   GET  /openapi.json
//
// Anything else → 404 with a hint pointing at /openapi.json. This Worker
// has no static assets or SPA fallback to break — it's a pure API surface.

interface Env {
  SUPABASE_URL:      string
  SUPABASE_ANON_KEY: string
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const GITHUB_RE   = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s?#]+?)(?:\.git)?\/?$/i
const GITHUB_HOST = /^github\.com\/([^/\s]+)\/([^/\s?#]+?)(?:\.git)?\/?$/i
const GITHUB_SLUG = /^([A-Za-z0-9][\w.-]*)\/([A-Za-z0-9][\w.-]*)$/

function canonicalize(input: string): { url: string; slug: string } | null {
  const s = input.trim()
  const m = s.match(GITHUB_RE) ?? s.match(GITHUB_HOST) ?? s.match(GITHUB_SLUG)
  if (!m) return null
  const owner = m[1]
  const repo  = m[2].replace(/\.git$/, '')
  return { url: `https://github.com/${owner}/${repo}`, slug: `${owner}/${repo}` }
}

interface PreviewSnapshot {
  score_total?:    number
  score_auto?:     number
  score_forecast?: number
  score_community?: number
  rich_analysis?: {
    scout_brief?: {
      strengths?:  Array<{ axis?: string; bullet?: string }>
      weaknesses?: Array<{ axis?: string; bullet?: string }>
    }
  }
}

interface PreviewProject {
  id?:           string
  project_name?: string
  github_url?:   string
}

interface PreviewEnvelope {
  status?:   'ready' | 'pending' | string
  project?:  PreviewProject
  snapshot?: PreviewSnapshot
  error?:    string
  message?:  string
  reason?:   string
  quota?:    Record<string, unknown>
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status:  init.status ?? 200,
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      ...CORS,
      ...(init.headers as Record<string, string> ?? {}),
    },
  })
}

function textResponse(body: string, contentType: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status:  init.status ?? 200,
    headers: {
      'Content-Type':  contentType,
      'Cache-Control': 'public, max-age=60',
      ...CORS,
      ...(init.headers as Record<string, string> ?? {}),
    },
  })
}

function renderMarkdown(env: PreviewEnvelope, slug: string): string {
  const p     = env.project   ?? {}
  const snap  = env.snapshot  ?? {}
  const total = typeof snap.score_total === 'number' ? snap.score_total : null
  const audit = typeof snap.score_auto === 'number' ? snap.score_auto : null
  const scout = typeof snap.score_forecast === 'number' ? snap.score_forecast : null
  const comm  = typeof snap.score_community === 'number' ? snap.score_community : null
  const sb    = snap.rich_analysis?.scout_brief
  const strengths = sb?.strengths?.slice(0, 3) ?? []
  const concerns  = sb?.weaknesses?.slice(0, 2) ?? []
  const projectUrl = p.id ? `https://commit.show/projects/${p.id}` : 'https://commit.show'

  const lines: string[] = []
  lines.push(`# commit.show audit · ${slug}`)
  lines.push('')
  if (total !== null) lines.push(`**Score: ${total} / 100**`)
  else                lines.push('Score: not yet computed.')
  lines.push('')
  if (audit !== null || scout !== null || comm !== null) {
    lines.push('| Pillar | Score |')
    lines.push('|---|---|')
    if (audit !== null) lines.push(`| Audit (50%) | ${audit} / 50 |`)
    if (scout !== null) lines.push(`| Scout (30%) | ${scout} / 30 |`)
    if (comm  !== null) lines.push(`| Community (20%) | ${comm} / 20 |`)
    lines.push('')
  }
  if (strengths.length > 0) {
    lines.push('## Strengths')
    strengths.forEach((s, i) => {
      const axis = s.axis ? `[${s.axis}] ` : ''
      lines.push(`${i + 1}. ${axis}${s.bullet ?? ''}`)
    })
    lines.push('')
  }
  if (concerns.length > 0) {
    lines.push('## Concerns')
    concerns.forEach((c, i) => {
      const axis = c.axis ? `[${c.axis}] ` : ''
      lines.push(`${i + 1}. ${axis}${c.bullet ?? ''}`)
    })
    lines.push('')
  }
  lines.push(`[View full audit on commit.show](${projectUrl})`)
  lines.push('')
  lines.push('---')
  lines.push('Powered by commit.show — the audit league for vibe-coded projects. Run `npx commitshow audit ' + slug + '` to re-run from a terminal.')
  return lines.join('\n')
}

async function handleAudit(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'GET' && request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, { status: 405 })
  }

  const url = new URL(request.url)
  let repo = url.searchParams.get('repo') ?? url.searchParams.get('url') ?? ''
  let format = (url.searchParams.get('format') ?? 'md').toLowerCase()
  if (request.method === 'POST') {
    try {
      const body = await request.json() as { repo?: string; url?: string; format?: string }
      repo   = body.repo ?? body.url ?? repo
      format = (body.format ?? format).toLowerCase()
    } catch { /* fall back to query string */ }
  }
  if (!repo) {
    return jsonResponse({
      error:   'missing_repo',
      message: 'Pass ?repo=<github-url> or owner/repo. Example: /audit?repo=github.com/cursor/cursor',
    }, { status: 400 })
  }

  const canon = canonicalize(repo)
  if (!canon) {
    return jsonResponse({
      error:   'bad_repo',
      message: 'Not a recognizable GitHub URL or owner/repo slug.',
      input:   repo,
    }, { status: 400 })
  }

  // HEAD pre-flight against github.com — agent that invented a slug
  // gets not_found before we burn audit budget. Network failure → let
  // the upstream call surface its own error.
  try {
    const head = await fetch(canon.url, { method: 'HEAD', redirect: 'follow' })
    if (head.status === 404) {
      return jsonResponse({
        error:   'not_found',
        message: `${canon.slug} doesn't resolve on github.com — wrong owner spelling, private repo, or renamed.`,
        target:  canon.url,
      }, { status: 404 })
    }
  } catch { /* let upstream produce a clearer error */ }

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ error: 'misconfigured', message: 'Server missing Supabase credentials.' }, { status: 500 })
  }

  const previewRes = await fetch(`${env.SUPABASE_URL}/functions/v1/audit-preview`, {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'Authorization':   `Bearer ${env.SUPABASE_ANON_KEY}`,
      'apikey':          env.SUPABASE_ANON_KEY,
      'x-forwarded-for': request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? '',
    },
    body: JSON.stringify({ github_url: canon.url }),
  })

  let payload: PreviewEnvelope
  try {
    payload = await previewRes.json() as PreviewEnvelope
  } catch {
    return jsonResponse({ error: 'upstream_invalid_json' }, { status: 502 })
  }

  if (!previewRes.ok || payload.error) {
    return jsonResponse(payload, { status: previewRes.status === 200 ? 502 : previewRes.status })
  }

  if (format === 'json') return jsonResponse(payload)
  const md = renderMarkdown(payload, canon.slug)
  return textResponse(md, 'text/markdown; charset=utf-8')
}

// ── OpenAPI 3.1 spec ────────────────────────────────────────────────
const OPENAPI = {
  openapi: '3.1.0',
  info: {
    title:       'commit.show audit API',
    summary:     'Public audit scores for vibe-coded GitHub projects.',
    description: 'Read the live commit.show audit for any public GitHub repo. Markdown by default (paste-ready), JSON for machines. No API key required. CORS open.',
    version:     '1.0.0',
    contact: { name: 'commit.show', url: 'https://commit.show' },
    license: { name: 'MIT', url: 'https://github.com/commitshow/commitshow/blob/main/LICENSE' },
  },
  servers: [{ url: 'https://api.commit.show', description: 'Production' }],
  tags: [{ name: 'audit', description: 'Run or read the live audit for a GitHub repo.' }],
  paths: {
    '/audit': {
      get: {
        tags: ['audit'],
        summary: 'Audit a public GitHub repo',
        operationId: 'auditRepo',
        parameters: [
          { name: 'repo',   in: 'query', required: true,  schema: { type: 'string', example: 'github.com/supabase/supabase' }, description: 'GitHub repo. Full URL, github.com/owner/repo, or owner/repo slug.' },
          { name: 'format', in: 'query', required: false, schema: { type: 'string', enum: ['md', 'json'], default: 'md' }, description: 'Response format.' },
        ],
        responses: {
          '200': {
            description: 'Audit returned.',
            content: {
              'text/markdown':    { schema: { type: 'string' } },
              'application/json': { schema: { $ref: '#/components/schemas/AuditEnvelope' } },
            },
          },
          '400': { description: 'Repo missing or malformed.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
          '404': { description: "Repo doesn't resolve on github.com.", content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
          '429': { description: 'Rate limit exceeded.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
        },
      },
      post: {
        tags: ['audit'],
        summary: 'Audit a public GitHub repo (POST variant)',
        operationId: 'auditRepoPost',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['repo'],
                properties: {
                  repo:   { type: 'string', example: 'github.com/supabase/supabase' },
                  format: { type: 'string', enum: ['md', 'json'], default: 'md' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Same as GET.', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuditEnvelope' } } } },
          '400': { description: 'Repo missing or malformed.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
          '404': { description: 'Repo not found on github.com.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
          '429': { description: 'Rate limit exceeded.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
        },
      },
    },
  },
  components: {
    schemas: {
      AuditEnvelope: {
        type: 'object',
        properties: {
          status:  { type: 'string', enum: ['ready', 'pending'] },
          project: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              project_name: { type: 'string' },
              github_url: { type: 'string', format: 'uri' },
              live_url:   { type: 'string', format: 'uri', nullable: true },
              status:     { type: 'string', enum: ['preview', 'active', 'graduated', 'valedictorian', 'retry'] },
            },
          },
          snapshot: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              created_at: { type: 'string', format: 'date-time' },
              trigger_type: { type: 'string', enum: ['initial', 'resubmit', 'weekly', 'season_end'] },
              score_total: { type: 'integer', minimum: 0, maximum: 100 },
              score_auto: { type: 'integer', minimum: 0, maximum: 50 },
              score_forecast: { type: 'integer', minimum: 0, maximum: 30 },
              score_community: { type: 'integer', minimum: 0, maximum: 20 },
            },
          },
        },
      },
      ErrorEnvelope: {
        type: 'object',
        required: ['error'],
        properties: {
          error:   { type: 'string', enum: ['missing_repo', 'bad_repo', 'not_found', 'rate_limited', 'misconfigured', 'upstream_invalid_json'] },
          message: { type: 'string' },
          target:  { type: 'string', nullable: true },
        },
      },
    },
  },
} as const

function handleOpenAPI(request: Request): Response {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  return new Response(JSON.stringify(OPENAPI, null, 2), {
    status: 200,
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
      ...CORS,
    },
  })
}

// ── Index page (root) — friendly for humans who type api.commit.show ─
function handleIndex(): Response {
  const md = [
    '# api.commit.show',
    '',
    'Public REST surface for the commit.show audit engine.',
    '',
    '- `GET /audit?repo=<github-url>&format=md|json` — run/read the live audit',
    '- `GET /openapi.json` — OpenAPI 3.1 spec',
    '',
    'Try it:',
    '```',
    'curl https://api.commit.show/audit?repo=github.com/supabase/supabase',
    '```',
    '',
    'Web: https://commit.show · CLI: `npx commitshow@latest audit <target>`',
  ].join('\n')
  return textResponse(md, 'text/markdown; charset=utf-8')
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/' || url.pathname === '')                     return handleIndex()
    if (url.pathname === '/audit' || url.pathname.startsWith('/audit/')) return handleAudit(request, env)
    if (url.pathname === '/openapi.json' || url.pathname === '/openapi') return handleOpenAPI(request)
    return jsonResponse({
      error:   'not_found',
      message: 'Unknown route. See https://api.commit.show/openapi.json for the supported surface.',
      path:    url.pathname,
    }, { status: 404 })
  },
}
