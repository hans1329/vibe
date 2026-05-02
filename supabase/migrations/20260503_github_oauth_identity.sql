-- ───────────────────────────────────────────────────────────────────────────
-- GitHub OAuth identity · members.github_handle + sync helper
-- ───────────────────────────────────────────────────────────────────────────
-- Mirror of 20260502_x_oauth_identity.sql for GitHub. Two write paths:
--
--   · handle_new_user · brand-new auth.users INSERT. If the signup came
--     from the GitHub OAuth provider, sync_github_identity fires right
--     after the row lands so github_handle is populated immediately.
--
--   · sync_github_identity(uuid) RPC · existing member adds GitHub via
--     supabase.auth.linkIdentity (VerifiedIdentities → "+ GitHub").
--     Idempotent · safe to call on every session change.
--
-- GitHub OAuth identity_data shape from Supabase Auth (provider='github'):
--   {
--     "user_name":         "k_ceo",            ← screen name
--     "preferred_username":"k_ceo",
--     "name":              "K Ceo",
--     "sub":               "12345678",         ← stable user id (string)
--     "provider_id":       "12345678",
--     "avatar_url":        "https://...",
--     "email":             "k@example.com",    ← public email if set
--     "html_url":          "https://github.com/k_ceo",
--     ...
--   }

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS github_handle       text,
  ADD COLUMN IF NOT EXISTS github_provider_id  text,
  ADD COLUMN IF NOT EXISTS github_connected_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_members_github_provider_id
  ON public.members (github_provider_id)
  WHERE github_provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_members_github_handle
  ON public.members (lower(github_handle))
  WHERE github_handle IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- sync_github_identity(p_user_id) — pull GitHub identity from auth.identities
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_github_identity(p_user_id uuid)
RETURNS public.members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_handle      text;
  v_provider_id text;
  v_email       text;
  v_row         public.members;
  v_caller      uuid := auth.uid();
  v_role        text := auth.role();
BEGIN
  IF v_role <> 'service_role' AND (v_caller IS NULL OR v_caller <> p_user_id) THEN
    RAISE EXCEPTION 'Not authorized to sync GitHub identity for another user';
  END IF;

  SELECT
    COALESCE(
      identity_data->>'user_name',
      identity_data->>'preferred_username'
    ),
    COALESCE(
      identity_data->>'provider_id',
      identity_data->>'sub',
      identity_data->>'id'
    ),
    NULLIF(btrim(COALESCE(identity_data->>'email', '')), '')
    INTO v_handle, v_provider_id, v_email
    FROM auth.identities
   WHERE user_id = p_user_id
     AND provider = 'github'
   ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
   LIMIT 1;

  IF v_handle IS NULL AND v_provider_id IS NULL THEN
    SELECT * INTO v_row FROM public.members WHERE id = p_user_id;
    RETURN v_row;
  END IF;

  UPDATE public.members
     SET github_handle       = COALESCE(v_handle,      github_handle),
         github_provider_id  = COALESCE(v_provider_id, github_provider_id),
         github_connected_at = COALESCE(github_connected_at,
                                        CASE WHEN v_handle IS NOT NULL OR v_provider_id IS NOT NULL THEN now() END),
         email               = COALESCE(email, v_email)   -- only fill if previously NULL
   WHERE id = p_user_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_github_identity(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- disconnect_github_identity(p_user_id) — clear GitHub columns
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.disconnect_github_identity(p_user_id uuid)
RETURNS public.members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row    public.members;
  v_caller uuid := auth.uid();
  v_role   text := auth.role();
BEGIN
  IF v_role <> 'service_role' AND (v_caller IS NULL OR v_caller <> p_user_id) THEN
    RAISE EXCEPTION 'Not authorized to disconnect GitHub for another user';
  END IF;

  UPDATE public.members
     SET github_handle       = NULL,
         github_provider_id  = NULL,
         github_connected_at = NULL
   WHERE id = p_user_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.disconnect_github_identity(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- handle_new_user — call sync_github_identity in the new-user fan-out
-- ───────────────────────────────────────────────────────────────────────────
-- Already calls sync_x_identity from the prior X migration. Add the GitHub
-- sync alongside so every signup path (X, GitHub, Google, email) lands a
-- consistent members row regardless of which OAuth provider was used.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.members (id, email, display_name, avatar_url)
  VALUES (
    new.id,
    NULLIF(btrim(COALESCE(new.email, '')), ''),
    COALESCE(
      NULLIF(btrim(new.raw_user_meta_data->>'display_name'), ''),
      NULLIF(btrim(new.raw_user_meta_data->>'preferred_username'), ''),
      NULLIF(btrim(new.raw_user_meta_data->>'user_name'), ''),
      NULLIF(btrim(new.raw_user_meta_data->>'name'), ''),
      NULLIF(split_part(COALESCE(new.email, ''), '@', 1), '')
    ),
    new.raw_user_meta_data->>'avatar_url'
  );

  PERFORM public.sync_x_identity(new.id);
  PERFORM public.sync_github_identity(new.id);

  RETURN new;
END;
$$;
