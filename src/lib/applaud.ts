// Applaud — v2 polymorphic toggle (§1-A ①③ · §7.5).
// Gesture semantics: 1 item = 1 applaud. Click toggles on/off.
// Targets any user-generated content: product · comment · build_log · stack · brief · recommit.
// No weight · no scout tier · no season gate. Community-signal only (§6.4).

import { supabase } from './supabase'
import type { ApplaudTargetType } from './supabase'

export interface ApplaudRef {
  targetType: ApplaudTargetType
  targetId:   string
  memberId:   string
}

export class CannotApplaudOwnContentError extends Error {
  constructor() {
    super("You can't applaud your own content.")
    this.name = 'CannotApplaudOwnContentError'
  }
}

// Returns true if the member already has an applaud on this target.
export async function hasApplauded(ref: ApplaudRef): Promise<boolean> {
  const { data } = await supabase
    .from('applauds')
    .select('id')
    .eq('member_id',   ref.memberId)
    .eq('target_type', ref.targetType)
    .eq('target_id',   ref.targetId)
    .maybeSingle()
  return !!data
}

// Insert the applaud. The DB trigger raises P0001 on self-applaud.
export async function castApplaud(ref: ApplaudRef): Promise<{ applaudId: string }> {
  const { data, error } = await supabase
    .from('applauds')
    .insert([{
      member_id:   ref.memberId,
      target_type: ref.targetType,
      target_id:   ref.targetId,
    }])
    .select('id')
    .single()

  if (error) {
    const msg = error.message || ''
    if (/Self-applaud blocked/i.test(msg)) {
      throw new CannotApplaudOwnContentError()
    }
    if (/duplicate key|applauds_member_id_target_type_target_id_key/i.test(msg)) {
      // Already applauded — treat as idempotent success by re-fetching the row.
      const { data: existing } = await supabase
        .from('applauds')
        .select('id')
        .eq('member_id',   ref.memberId)
        .eq('target_type', ref.targetType)
        .eq('target_id',   ref.targetId)
        .single()
      return { applaudId: existing!.id }
    }
    throw error
  }
  return { applaudId: data.id }
}

// Toggle-off: delete the existing applaud row for this (member, target).
export async function removeApplaud(ref: ApplaudRef): Promise<void> {
  const { error } = await supabase
    .from('applauds')
    .delete()
    .eq('member_id',   ref.memberId)
    .eq('target_type', ref.targetType)
    .eq('target_id',   ref.targetId)
  if (error) throw error
}

// Convenience: one call that flips the state.
export async function toggleApplaud(ref: ApplaudRef): Promise<{ active: boolean }> {
  const already = await hasApplauded(ref)
  if (already) {
    await removeApplaud(ref)
    return { active: false }
  }
  await castApplaud(ref)
  return { active: true }
}

// Count applauds on a single target (used by feed cards and detail pages).
export async function countApplauds(
  targetType: ApplaudTargetType,
  targetId:   string,
): Promise<number> {
  const { count } = await supabase
    .from('applauds')
    .select('id', { count: 'exact', head: true })
    .eq('target_type', targetType)
    .eq('target_id',   targetId)
  return count ?? 0
}
