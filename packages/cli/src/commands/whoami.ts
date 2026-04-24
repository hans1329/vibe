import { readConfig } from '../lib/config.js'
import { c } from '../lib/colors.js'

export async function whoami(_args: string[]): Promise<number> {
  const cfg = readConfig()
  if (!cfg.token || !cfg.display_name) {
    console.log(c.muted('Not signed in.'))
    console.log(c.dim('  Read-only commands still work. Login coming in the next CLI release.'))
    return 1
  }
  console.log(c.cream(cfg.display_name))
  if (cfg.member_id) console.log(c.muted(`  ${cfg.member_id}`))
  return 0
}
