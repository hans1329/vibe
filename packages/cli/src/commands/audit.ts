import { resolveTarget, TargetError } from '../lib/target.js'
import { findProjectByGithubUrl, fetchLatestSnapshot, fetchStanding } from '../lib/api.js'
import { renderAudit, renderMarkdown, writeAuditMarkdown } from '../lib/render.js'
import { c } from '../lib/colors.js'

export async function audit(args: string[]): Promise<number> {
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

  console.log(c.dim(`Auditing ${target.slug}…`))

  const project = await findProjectByGithubUrl(target.github_url)
  if (!project) {
    console.log('')
    console.log(c.cream(`No audition yet for ${target.slug}.`))
    console.log('')
    console.log(c.muted(`Put your project on stage at https://commit.show/submit`))
    console.log(c.muted(`or once you're signed in: ${c.gold('commitshow submit')} ${c.dim('(coming soon)')}`))
    return 1
  }

  const [snapshot, standing] = await Promise.all([
    fetchLatestSnapshot(project.id),
    fetchStanding(project.id),
  ])

  const view = { project, snapshot, standing }
  console.log('')
  console.log(renderAudit(view))
  console.log('')

  // Persist .commitshow/audit.md in local mode so AI agents can read it next turn.
  if (target.kind === 'local') {
    const path = writeAuditMarkdown(target.localPath, renderMarkdown(view))
    if (path) console.log(c.dim(`  Saved → ${path}`))
  }

  return 0
}
