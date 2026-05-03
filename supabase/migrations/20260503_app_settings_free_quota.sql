-- app_settings · runtime config table for values an admin can flip
-- without a code deploy. Single source of truth for promo / quota toggles
-- that both the frontend and Edge Functions read.
--
-- First setting (and the immediate motivation): free_audits_per_member.
-- Schema-level intent is paid-by-default ($99 per audit), but we want
-- to ship a launch promo of 3 free audits and keep the option of
-- repeating the promo on demand. Admin sets value=0 to end the promo,
-- value=3 to re-run it. Setting takes effect on the *next* eligibility
-- check from any client (no user-level caching beyond the per-render
-- fetch).

CREATE TABLE IF NOT EXISTS public.app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.members(id) ON DELETE SET NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Public read · the eligibility check needs every visiting client to see
-- the current quota so the gate copy renders correctly. Settings stored
-- here are not secrets.
DROP POLICY IF EXISTS "anyone reads app_settings" ON public.app_settings;
CREATE POLICY "anyone reads app_settings" ON public.app_settings
  FOR SELECT USING (true);

-- Writes only flow through the set_app_setting RPC (admin-gated).
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL    ON public.app_settings TO service_role;

-- ── Reader RPC ──
-- Stable so PostgREST can cache within a request. Returns null if key
-- is unknown · callers are expected to pass a sane fallback default.
CREATE OR REPLACE FUNCTION public.get_app_setting(p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.app_settings WHERE key = p_key;
$$;

REVOKE ALL ON FUNCTION public.get_app_setting(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_app_setting(text) TO anon, authenticated, service_role;

-- ── Admin-only writer RPC ──
-- members.is_admin is the gate · same policy as /admin route guard.
-- UPSERT semantics so a new key is created on first call and existing
-- ones updated in place. Returns the row so the admin UI can confirm.
CREATE OR REPLACE FUNCTION public.set_app_setting(p_key text, p_value jsonb)
RETURNS public.app_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_admin  boolean;
  v_row    public.app_settings;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign-in required';
  END IF;

  SELECT is_admin INTO v_admin FROM public.members WHERE id = v_caller;
  IF NOT COALESCE(v_admin, false) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  INSERT INTO public.app_settings (key, value, updated_by, updated_at)
  VALUES (p_key, p_value, v_caller, now())
  ON CONFLICT (key) DO UPDATE
    SET value      = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_app_setting(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_app_setting(text, jsonb) TO authenticated, service_role;

-- ── Seed ──
-- Free audits per member · current launch promo state = 3. Admin can
-- flip to 0 to switch to default-paid policy.
INSERT INTO public.app_settings (key, value, description) VALUES
  ('free_audits_per_member', '3'::jsonb,
    'Free audits each member gets before the paid $99 gate kicks in. 0 = paid only · 3 = launch promo. Changes take effect on the next eligibility check.')
ON CONFLICT (key) DO NOTHING;
