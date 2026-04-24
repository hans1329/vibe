// Same render as `audit`, but never re-runs analysis — just reads the latest
// cached snapshot. Cheap · offline-ish · safe to poll. Honors --json the
// same way audit does.

import { resolveTarget, TargetError } from '../lib/target.js'
import { findProjectByGithubUrl, fetchLatestSnapshot, fetchStanding } from '../lib/api.js'
import { renderAudit, renderJson } from '../lib/render.js'
import { c } from '../lib/colors.js'

export async function status(args: string[]): Promise<number> {
  const asJson = args.includes('--json')
  const positional = args.find(a => !a.startsWith('--'))

  let target
  try {
    target = resolveTarget(positional)
  } catch (err) {
    if (err instanceof TargetError) {
      emitError(asJson, 'bad_target', err.message, positional)
      return 2
    }
    throw err
  }

  const project = await findProjectByGithubUrl(target.github_url)
  if (!project) {
    emitError(asJson, 'not_found', `No audition yet for ${target.slug}.`, target.github_url)
    return 1
  }
  const [snapshot, standing] = await Promise.all([
    fetchLatestSnapshot(project.id),
    fetchStanding(project.id),
  ])
  const view = { project, snapshot, standing }

  if (asJson) {
    process.stdout.write(renderJson(view) + '\n')
  } else {
    console.log('')
    console.log(renderAudit(view))
  }
  return 0
}

function emitError(asJson: boolean, code: string, message: string, target?: string): void {
  if (asJson) {
    process.stdout.write(JSON.stringify({ error: code, message, target: target ?? null }) + '\n')
  } else {
    console.error(c.scarlet(message))
  }
}
