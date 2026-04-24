import { resolveTarget, TargetError } from '../lib/target.js'
import { findProjectByGithubUrl, fetchLatestSnapshot, fetchStanding } from '../lib/api.js'
import {
  renderAudit, renderMarkdown, renderJson,
  writeAuditMarkdown, writeAuditJson,
} from '../lib/render.js'
import { c } from '../lib/colors.js'

export async function audit(args: string[]): Promise<number> {
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

  if (!asJson) console.log(c.dim(`Auditing ${target.slug}…`))

  const project = await findProjectByGithubUrl(target.github_url)
  if (!project) {
    emitError(
      asJson, 'not_found',
      `No audition yet for ${target.slug}. Put your project on stage at https://commit.show/submit.`,
      target.github_url,
    )
    return 1
  }

  const [snapshot, standing] = await Promise.all([
    fetchLatestSnapshot(project.id),
    fetchStanding(project.id),
  ])

  const view = { project, snapshot, standing }

  if (asJson) {
    // stdout JSON only. Never emit anything else — consumer pipes to jq.
    process.stdout.write(renderJson(view) + '\n')
  } else {
    console.log('')
    console.log(renderAudit(view))
    console.log('')
  }

  // Persist both .md and .json in local mode so AI agents get both human
  // and machine context for their next turn.
  if (target.kind === 'local') {
    const mdPath   = writeAuditMarkdown(target.localPath, renderMarkdown(view))
    const jsonPath = writeAuditJson(target.localPath, renderJson(view))
    if (!asJson) {
      if (mdPath)   console.log(c.dim(`  Saved → ${mdPath}`))
      if (jsonPath) console.log(c.dim(`  Saved → ${jsonPath}`))
    }
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
