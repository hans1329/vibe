// Unified display-name resolver across every surface that shows a Creator
// byline (project grid · library row · community post · detail header · etc.).
//
// Fallback hierarchy (2026-04-25 privacy update):
//   1) live `display_name` from members — always non-null post-migration
//      (handle_new_user trigger auto-assigns email prefix at signup · legacy
//       rows backfilled by 20260425130000_display_name_privacy.sql)
//   2) `creator_name` snapshot (taken at submit time on projects rows · may
//      still carry an older pre-backfill value)
//   3) 'Unnamed' as a last-resort terminal label for truly missing data
//
// Email prefix was dropped from the fallback chain because surfaces should
// never see another user's email in the first place. The corresponding
// author_email / email columns were stripped from public views
// (md_library_feed, member_stats) in the same migration.

export interface CreatorNameInput {
  display_name?: string | null
  creator_name?: string | null   // snapshot stored on projects rows at submit
}

export const FALLBACK_NAME = 'Unnamed'

export function resolveCreatorName(input: CreatorNameInput): string {
  if (input.display_name && input.display_name.trim().length > 0) {
    return input.display_name.trim()
  }
  if (input.creator_name && input.creator_name.trim().length > 0) {
    return input.creator_name.trim()
  }
  return FALLBACK_NAME
}

// First-letter fallback for avatar tile. Mirrors resolveCreatorName's
// priority so the initial always matches the rendered label.
export function resolveCreatorInitial(input: CreatorNameInput): string {
  return resolveCreatorName(input).slice(0, 1).toUpperCase()
}
