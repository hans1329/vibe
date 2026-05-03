-- ───────────────────────────────────────────────────────────────────────────
-- Stripe payments · audit-fee credits + payment ledger
-- ───────────────────────────────────────────────────────────────────────────
-- V1 §16.2 P7 launch piece: charge $99 for the 4th+ audit per member.
--
-- Two pieces of state:
--
--   1. payments  — one row per Stripe Checkout Session we create.
--      lifecycle: pending → succeeded / failed / refunded.
--      stripe_event_ids[] lets the webhook replay-protect (each event
--      processed at most once per payment row).
--
--   2. members.paid_audits_credit — int counter. +1 per succeeded
--      audit-fee payment, -1 each time the member redeems it on a
--      project audit. Eligibility check: free quota (3) → paid credit →
--      blocked.
--
-- Refunds: subtract a credit if it hasn't been redeemed yet. If it has,
-- the refund just gets recorded and we don't retroactively un-audit
-- (audit history is immutable). Documented for the operator; no auto-
-- credit-clawback logic — easier to refund manually.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payments (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id                uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  kind                     text        NOT NULL CHECK (kind IN ('audit_fee', 'library_purchase')),
  amount_cents             int         NOT NULL CHECK (amount_cents >= 0),
  currency                 text        NOT NULL DEFAULT 'USD',

  stripe_session_id        text        UNIQUE,
  stripe_payment_intent_id text,
  stripe_event_ids         text[]      NOT NULL DEFAULT '{}',

  status                   text        NOT NULL DEFAULT 'pending'
                                       CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'canceled')),

  metadata                 jsonb       NOT NULL DEFAULT '{}'::jsonb,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  succeeded_at             timestamptz NULL,
  refunded_at              timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_member_kind_status
  ON public.payments (member_id, kind, status);

CREATE INDEX IF NOT EXISTS idx_payments_stripe_session
  ON public.payments (stripe_session_id) WHERE stripe_session_id IS NOT NULL;

-- updated_at touch trigger · same pattern as other tables
CREATE OR REPLACE FUNCTION public.payments_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN new.updated_at := now(); RETURN new; END;
$$;

DROP TRIGGER IF EXISTS trg_payments_touch_updated_at ON public.payments;
CREATE TRIGGER trg_payments_touch_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_touch_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- members.paid_audits_credit — cached counter for the eligibility check.
-- Trigger keeps it in sync with payments lifecycle so application code
-- never has to recompute by joining + summing.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS paid_audits_credit int NOT NULL DEFAULT 0
                                              CHECK (paid_audits_credit >= 0);

-- payments → members.paid_audits_credit sync.
-- Fire when status flips to/from 'succeeded' on an audit_fee payment.
CREATE OR REPLACE FUNCTION public.payments_sync_audit_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only audit_fee payments touch the credit counter.
  IF COALESCE(NEW.kind, OLD.kind) <> 'audit_fee' THEN
    RETURN NEW;
  END IF;

  -- Status went pending/anything → succeeded · grant a credit.
  IF (TG_OP = 'INSERT' AND NEW.status = 'succeeded') OR
     (TG_OP = 'UPDATE' AND OLD.status <> 'succeeded' AND NEW.status = 'succeeded') THEN
    UPDATE public.members
       SET paid_audits_credit = paid_audits_credit + 1
     WHERE id = NEW.member_id;
  END IF;

  -- Status went succeeded → refunded · revoke a credit (if any left).
  -- We allow paid_audits_credit to floor at 0 so an already-redeemed
  -- audit's refund doesn't try to negate a non-existent credit.
  IF TG_OP = 'UPDATE' AND OLD.status = 'succeeded' AND NEW.status = 'refunded' THEN
    UPDATE public.members
       SET paid_audits_credit = GREATEST(0, paid_audits_credit - 1)
     WHERE id = NEW.member_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_sync_audit_credit ON public.payments;
CREATE TRIGGER trg_payments_sync_audit_credit
  AFTER INSERT OR UPDATE OF status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_sync_audit_credit();

-- ───────────────────────────────────────────────────────────────────────────
-- redeem_audit_credit(p_member_id, p_project_id) — decrement counter.
-- ───────────────────────────────────────────────────────────────────────────
-- Called by the audit submission path right before a paid audit fires.
-- Returns true on success (counter decremented), false on no-credit.
-- Idempotent at the row level — caller should only invoke once per audit.
CREATE OR REPLACE FUNCTION public.redeem_audit_credit(p_member_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining int;
BEGIN
  UPDATE public.members
     SET paid_audits_credit = paid_audits_credit - 1
   WHERE id = p_member_id
     AND paid_audits_credit > 0
   RETURNING paid_audits_credit INTO v_remaining;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Stamp which payment got redeemed for which project. We can't know
  -- which exact payment row was "the one" — pick the oldest unredeemed
  -- succeeded audit_fee row.
  UPDATE public.payments
     SET metadata = COALESCE(metadata, '{}'::jsonb)
                    || jsonb_build_object(
                         'redeemed_for_project_id', p_project_id,
                         'redeemed_at',             now()
                       )
   WHERE id = (
     SELECT id FROM public.payments
      WHERE member_id = p_member_id
        AND kind = 'audit_fee'
        AND status = 'succeeded'
        AND NOT (metadata ? 'redeemed_for_project_id')
      ORDER BY succeeded_at NULLS LAST, created_at
      LIMIT 1
   );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_audit_credit(uuid, uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- RLS · members can read their own payment rows
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_self_read ON public.payments;
CREATE POLICY payments_self_read
  ON public.payments FOR SELECT
  USING (member_id = auth.uid());

-- Writes only via service-role (Edge Function `create-checkout-session`
-- and `stripe-webhook`). No client-side INSERT / UPDATE on payments.
