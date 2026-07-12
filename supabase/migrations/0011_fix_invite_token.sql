-- 0011 — Fix invite creation on hosted Supabase.
-- create_invite mints its token with pgcrypto's gen_random_bytes(), but the
-- function is pinned to `search_path = public` while Supabase installs pgcrypto
-- into the `extensions` schema — so on the cloud it fails with
-- "function gen_random_bytes(integer) does not exist" (invites are broken).
-- It passed tests only because the PGlite harness loads pgcrypto into public.
-- Fix: add `extensions` to the function's search_path. (Non-existent schemas in
-- search_path are ignored, so this is a no-op under PGlite.) Body unchanged.
create or replace function public.create_invite(p_org uuid, p_email text, p_role membership_role default 'member')
returns invites language plpgsql security definer set search_path = public, extensions as $$
declare v invites;
begin
  if not app.has_org_role(p_org, array['owner','admin']::membership_role[]) then
    raise exception 'insufficient privileges';
  end if;
  insert into invites (org_id, email, role, token, invited_by)
  values (p_org, p_email, p_role, encode(gen_random_bytes(18), 'hex'), auth.uid())
  returning * into v;
  return v;
end;
$$;
