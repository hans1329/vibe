// stripe-webhook — Stripe → our DB sync.
//
// Events handled:
//   · checkout.session.completed    → payments.status = 'succeeded'
//                                     (DB trigger grants paid_audits_credit +1)
//   · checkout.session.async_payment_succeeded → same
//   · checkout.session.async_payment_failed    → status = 'failed'
//   · checkout.session.expired                  → status = 'canceled'
//   · charge.refunded                            → status = 'refunded'
//                                     (DB trigger decrements credit if unused)
//
// Idempotency: payments.stripe_event_ids[] gets the event.id pushed each
// time. Replays of the same event are no-ops. Stripe retries webhooks
// for up to 3 days on failure; this design tolerates them.
//
// Security: Stripe signs every webhook with the endpoint secret. We
// reject any request whose stripe-signature header doesn't verify.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno runtime

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import Stripe from 'https://esm.sh/stripe@14.22.0?target=deno'

function txt(body: string, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return txt('POST required', 405)

  const STRIPE_SECRET         = Deno.env.get('STRIPE_SECRET_KEY')
  const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!STRIPE_SECRET || !STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe-webhook] missing STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET')
    return txt('Webhook not configured', 500)
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2024-09-30.acacia' })
  const sig = req.headers.get('stripe-signature') ?? ''
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    // Use the async variant — Deno doesn't expose Node's sync crypto.
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed', (err as Error)?.message)
    return txt('Invalid signature', 400)
  }

  // Find or upsert the payments row by stripe_session_id (or
  // payment_intent for charge.refunded events).
  const sessionId = (event.data.object as any)?.id              // session.* events
  const paymentIntentId = (event.data.object as any)?.payment_intent
                       ?? (event.data.object as any)?.payment_intent_id
                       ?? null
  const lookupSessionId =
    event.type.startsWith('checkout.session.') ? sessionId :
    null

  let { data: row } = await admin
    .from('payments')
    .select('id, member_id, status, stripe_event_ids')
    .eq(lookupSessionId ? 'stripe_session_id' : 'stripe_payment_intent_id',
        lookupSessionId ?? paymentIntentId ?? '')
    .maybeSingle()

  // For refund events we don't have session_id directly · look up by
  // payment_intent embedded in the charge.
  if (!row && event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge
    const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null
    if (piId) {
      const { data: piRow } = await admin
        .from('payments')
        .select('id, member_id, status, stripe_event_ids')
        .eq('stripe_payment_intent_id', piId)
        .maybeSingle()
      row = piRow
    }
  }

  if (!row) {
    // No matching local row — log and ack so Stripe stops retrying.
    // Most common cause: webhook for a session created outside our flow.
    console.warn('[stripe-webhook] no local payment row for', event.type, sessionId)
    return txt('No matching payment row · ignored', 200)
  }

  // Idempotency · skip if we've already processed this event.
  if ((row.stripe_event_ids ?? []).includes(event.id)) {
    return txt('Already processed', 200)
  }

  // Map Stripe events → our status state machine.
  let newStatus: string | null = null
  let succeededAt: string | null = null
  let refundedAt:  string | null = null

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      newStatus   = 'succeeded'
      succeededAt = new Date().toISOString()
      break
    case 'checkout.session.async_payment_failed':
      newStatus = 'failed'
      break
    case 'checkout.session.expired':
      newStatus = 'canceled'
      break
    case 'charge.refunded':
      newStatus  = 'refunded'
      refundedAt = new Date().toISOString()
      break
    default:
      // Event we don't care about · just record the id to avoid reprocessing.
      break
  }

  const updates: Record<string, unknown> = {
    stripe_event_ids: [...(row.stripe_event_ids ?? []), event.id],
  }
  if (newStatus) updates.status = newStatus
  if (succeededAt) updates.succeeded_at = succeededAt
  if (refundedAt)  updates.refunded_at  = refundedAt
  if (paymentIntentId) updates.stripe_payment_intent_id = paymentIntentId

  const { error: updErr } = await admin
    .from('payments')
    .update(updates)
    .eq('id', row.id)

  if (updErr) {
    console.error('[stripe-webhook] update failed', updErr.message)
    return txt('Update failed', 500)
  }

  return txt('OK', 200)
})
