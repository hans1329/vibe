// User-share template runtime · reads cmo_templates (audience='user_share')
// rows, fills {slot} placeholders, and opens X intent URL pre-filled with
// the user's first-person tweet copy.
//
// CMO's Room (admin /admin/cmo) is where these templates are EDITED.
// This module is where they are CONSUMED on user-facing pages
// (ProjectDetailPage, ProfilePage, ScoutsPage, etc.).
//
// One-button flow: user clicks "Share on X" on their own audit / graduation
// / milestone result → we fetch the latest copy_template, substitute slots,
// and open twitter.com/intent/tweet?text=...&url=... in a new tab. X auto-
// embeds an unfurled card if the linked URL has og:image meta tags.

import { supabase } from './supabase'

// Fixed enum mirroring cmo_templates seed rows (20260504 migration).
// audit_complete    · /projects/:id  (own audit · creator share)
// graduation        · /projects/:id  (own project graduated)
// milestone         · /projects/:id  (own project hit milestone)
// early_spotter     · /scouts/:id · /me  (Scout Forecast hit)
export type UserShareTemplateId =
  | 'audit_complete'
  | 'graduation'
  | 'milestone'
  | 'early_spotter'

export type SlotMap = Record<string, string | number | null | undefined>

// Module-level cache · templates change rarely (admin edit only) so a 5min
// TTL is fine. Avoids round-tripping cmo_templates on every page render.
const TTL_MS = 5 * 60_000
const cache  = new Map<string, { copy: string; at: number }>()

export async function fetchUserShareTemplate(id: UserShareTemplateId): Promise<string | null> {
  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.copy
  const { data, error } = await supabase
    .from('cmo_templates')
    .select('copy_template')
    .eq('id', id)
    .eq('audience', 'user_share')
    .maybeSingle()
  if (error || !data) return null
  cache.set(id, { copy: data.copy_template, at: Date.now() })
  return data.copy_template
}

/** Replace {slot_name} placeholders with values from the slot map.
 *  Missing slots collapse to empty strings — a missing concern bullet
 *  shouldn't render `{top_concern_1}` as visible literal in the tweet. */
export function fillSlots(template: string, slots: SlotMap): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = slots[key]
    return v === null || v === undefined ? '' : String(v)
  }).replace(/\n{3,}/g, '\n\n').trim()
}

/** Build the X intent URL · X eats 23 chars for the URL slot, so keep
 *  the assembled `text` under ~250 chars to stay safely within 280. */
export function buildIntentUrl(text: string, url?: string): string {
  const params = new URLSearchParams()
  params.set('text', text)
  if (url) params.set('url', url)
  return `https://twitter.com/intent/tweet?${params.toString()}`
}

/** End-to-end: load template by id, fill slots, open the intent URL.
 *  Returns false if the template couldn't be loaded (caller decides
 *  whether to surface a fallback / error toast). */
export async function shareWithTemplate(
  id:   UserShareTemplateId,
  slots: SlotMap,
  url?: string,
): Promise<boolean> {
  const template = await fetchUserShareTemplate(id)
  if (!template) return false
  const text = fillSlots(template, slots)
  window.open(buildIntentUrl(text, url), '_blank', 'noopener,noreferrer')
  return true
}
