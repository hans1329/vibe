// Registration pricing gate (CLAUDE.md §14 · v1.7)
// Permanent policy: first 3 projects per member are free, 4th+ = $99
// per audit. Paid audits land as a +1 credit on members.paid_audits_credit
// when the Stripe webhook flips the payment to succeeded — eligibility
// returns ok=true while credits remain, blocked once they're exhausted.

import { supabase } from './supabase'

export const FREE_REGISTRATIONS_PER_MEMBER = 3
export const REGISTRATION_PRICE_CENTS = 9900  // $99.00

export type RegistrationEligibility =
  | { ok: true;  reason: 'free_quota';  priorCount: number; remainingFree: number; paidCredit: number }
  | { ok: true;  reason: 'paid_credit'; priorCount: number; remainingFree: 0;       paidCredit: number }
  | { ok: false; reason: 'quota_exhausted'; priorCount: number; priceCents: number; paidCredit: number }

export async function checkRegistrationEligibility(memberId: string): Promise<RegistrationEligibility> {
  // Count audits this member has already submitted, regardless of free
  // vs paid origin — that's the input to "have you used your free 3?"
  const [{ count, error: projErr }, { data: memberRow, error: memErr }] = await Promise.all([
    supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', memberId),
    supabase
      .from('members')
      .select('paid_audits_credit')
      .eq('id', memberId)
      .maybeSingle(),
  ])

  const priorCount  = projErr ? 0 : (count ?? 0)
  const paidCredit  = memErr ? 0 : (memberRow?.paid_audits_credit ?? 0)

  // Path 1 · still in the free 3 → no payment needed.
  if (priorCount < FREE_REGISTRATIONS_PER_MEMBER) {
    return {
      ok: true,
      reason: 'free_quota',
      priorCount,
      remainingFree: FREE_REGISTRATIONS_PER_MEMBER - priorCount,
      paidCredit,
    }
  }

  // Path 2 · free quota exhausted but the member has bought a credit.
  if (paidCredit > 0) {
    return {
      ok: true,
      reason: 'paid_credit',
      priorCount,
      remainingFree: 0,
      paidCredit,
    }
  }

  // Path 3 · blocked. UI surfaces the Stripe checkout button.
  return {
    ok: false,
    reason: 'quota_exhausted',
    priorCount,
    priceCents: REGISTRATION_PRICE_CENTS,
    paidCredit,
  }
}
