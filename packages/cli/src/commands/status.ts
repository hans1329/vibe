// Same render as `audit`, but never re-runs analysis — just reads the latest
// cached snapshot. Cheap · offline-ish · safe to poll.

import { resolveTarget, TargetError } from '../lib/target.js'
import { findProjectByGithubUrl, fetchLatestSnapshot, fetchStanding } from '../lib/api.js'
import { renderAudit } from '../lib/render.js'
import { c } from '../lib/colors.js'

export async function status(args: string[]): Promise<number> {
  const positional = args.find(a => !a.startsWith('--'))
  let target
  try {
    target = resolveTarget(positional)
  } catch (err) {
    if (err instanceof TargetError) {
      console.error(c.scarlet(err.message))
      return 2
    }
    throw err
  }

  const project = await findProjectByGithubUrl(target.github_url)
  if (!project) {
    console.log(c.cream(`No audition yet for ${target.slug}.`))
    return 1
  }
  const [snapshot, standing] = await Promise.all([
    fetchLatestSnapshot(project.id),
    fetchStanding(project.id),
  ])
  console.log('')
  console.log(renderAudit({ project, snapshot, standing }))
  return 0
}
