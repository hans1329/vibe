import { c } from '../lib/colors.js'

export async function install(_args: string[]): Promise<number> {
  console.log('')
  console.log(c.cream('Install is not yet available in CLI 0.1.'))
  console.log('')
  console.log(c.muted('  `commitshow install <pack>` will write MCP / IDE rule files directly into'))
  console.log(c.muted('  the cwd. Requires login + GitHub OAuth for Apply-to-my-repo PRs.'))
  console.log('')
  console.log(c.dim('  Use Apply-to-my-repo on the web → https://commit.show/library'))
  return 1
}
