// __admin_run · TEMPORARY one-shot SQL runner. Used to apply
// migrations the CLI can't push due to version-number collisions.
// Gated by ADMIN_TOKEN. Delete after migration runs.
//
// @ts-nocheck

import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('POST only', { status: 405, headers: CORS })

  const adminToken = Deno.env.get('ADMIN_TOKEN') ?? ''
  if (!adminToken || req.headers.get('x-admin-token') !== adminToken) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  const body = await req.json().catch(() => ({}))
  const sql: string = body.sql ?? ''
  if (!sql) return new Response(JSON.stringify({ error: 'sql required' }), { status: 400, headers: CORS })

  // Connection string from Supabase env (the pooler endpoint)
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')
  if (!dbUrl) return new Response(JSON.stringify({ error: 'SUPABASE_DB_URL not set' }), { status: 500, headers: CORS })

  try {
    const client = postgres(dbUrl, { ssl: 'require', max: 1 })
    const result = await client.unsafe(sql)
    await client.end()
    return new Response(JSON.stringify({ ok: true, rows: Array.isArray(result) ? result : [result] }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'sql_error', message: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
