import { c } from '../lib/colors.js'

export async function submit(_args: string[]): Promise<number> {
  console.log('')
  console.log(c.cream('Submit is not yet available in CLI 0.1.'))
  console.log('')
  console.log(c.muted('  Core Intent + screenshots + Brief upload needs login,'))
  console.log(c.muted('  which ships alongside the device-flow endpoint.'))
  console.log('')
  console.log(c.dim('  Submit on the web for now → https://commit.show/submit'))
  return 1
}
