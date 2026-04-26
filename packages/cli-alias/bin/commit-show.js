#!/usr/bin/env node
// Thin alias · `npx commit.show <args>` → `commitshow <args>`.
// We import the real CLI's compiled entrypoint so behaviour stays identical
// even as `commitshow` updates (semver dependency).
import('commitshow/dist/index.js').then(m => m.main(process.argv.slice(2))).catch(err => {
  console.error(err?.message ?? err)
  process.exit(1)
})
