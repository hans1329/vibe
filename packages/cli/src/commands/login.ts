// Device flow placeholder. Needs the /cli/link web page + token-exchange
// Edge Function on the server side (V1 backend work · see CLAUDE.md §15-C.4
// rollout). Until that lands, we fail fast with a clear message so the user
// knows their audit/status commands still work read-only.

import { c } from '../lib/colors.js'

export async function login(_args: string[]): Promise<number> {
  console.log('')
  console.log(c.cream('Login is not yet available in 0.1.'))
  console.log('')
  console.log(c.muted('  Read-only commands (audit, status, whoami) already work against public data.'))
  console.log(c.muted('  Write commands (submit, re-audit, install) unlock once the device-flow'))
  console.log(c.muted('  endpoint ships — tracked as a V1 item in the roadmap.'))
  console.log('')
  console.log(c.dim('  Sign in on the web for now → https://commit.show'))
  return 1
}
