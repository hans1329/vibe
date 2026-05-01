// Worker entry · all requests come through this script.
//
// We deploy via Workers Static Assets (wrangler.jsonc · assets binding
// 'ASSETS'). The default behavior is "look up <path> in /dist, fall back
// to /index.html for SPA routing". This entry adds API routes that need
// to run server-side BEFORE the asset lookup — without it, /api/* would
// be SPA-fallback'd to index.html and the agent gets HTML instead of
// the audit response.
//
// Routes:
//   /api/audit?repo=…  → src/api/audit.ts
//   everything else    → env.ASSETS.fetch(request)  (static + SPA fallback)

import { handleAudit, type AuditEnv } from './api/audit'
import { handleOpenAPI } from './api/openapi'

interface Env extends AuditEnv {
  ASSETS: { fetch: (req: Request) => Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/audit' || url.pathname.startsWith('/api/audit/')) {
      return handleAudit(request, env)
    }
    if (url.pathname === '/api/openapi.json' || url.pathname === '/api/openapi') {
      return handleOpenAPI(request)
    }
    // Static assets first. If the binding 404s on a path that doesn't
    // look like a static file (no extension), serve /index.html so the
    // React Router on the SPA side can route client-side. This replaces
    // the not_found_handling: single-page-application config that
    // applies automatically WITHOUT a worker entry but is bypassed once
    // we own routing here.
    const assetResponse = await env.ASSETS.fetch(request)
    if (assetResponse.status === 404 && !/\.[A-Za-z0-9]+$/.test(url.pathname)) {
      const indexUrl = new URL('/', request.url)
      const fallback = await env.ASSETS.fetch(new Request(indexUrl, request))
      // Mirror SPA fallback semantics — serve index.html with a 200 so
      // React Router renders the matched route. Keep the original
      // request's headers (cookies, accept, etc.) on the inner fetch.
      return new Response(fallback.body, {
        status:  200,
        headers: fallback.headers,
      })
    }
    return assetResponse
  },
}
