// Unified display-name resolver across every surface that shows a Creator
// byline (project grid · library row · community post · detail header · etc.).
//
// Fallback hierarchy:
//   1) live `display_name` from members
//   2) `creator_name` snapshot (taken at submit time on projects rows)
//   3) email username prefix when the surface already carries email (library view)
//   4) 'Unnamed' as a last-resort terminal label
//
// The terminal label was unified 2026-04-25 — earlier code had scattered
// 'Anonymous' (project surfaces) and 'Creator' (library surfaces) literals
// that confused users seeing the same person rendered differently in two
// places.

export interface CreatorNameInput {
  display_name?: string | null
  creator_name?: string | null   // snapshot stored on projects rows at submit
  email?: string | null
}

export const FALLBACK_NAME = 'Unnamed'

export function resolveCreatorName(input: CreatorNameInput): string {
  if (input.display_name && input.display_name.trim().length > 0) {
    return input.display_name.trim()
  }
  if (input.creator_name && input.creator_name.trim().length > 0) {
    return input.creator_name.trim()
  }
  if (input.email) {
    const prefix = input.email.split('@')[0]
    if (prefix && prefix.trim().length > 0) return prefix.trim()
  }
  return FALLBACK_NAME
}

// First-letter fallback for avatar tile. Mirrors resolveCreatorName's
// priority so the initial always matches the rendered label.
export function resolveCreatorInitial(input: CreatorNameInput): string {
  return resolveCreatorName(input).slice(0, 1).toUpperCase()
}
