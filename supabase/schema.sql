-- UCC Workspace — cloud sync schema.
--
-- Run this ONCE in your Supabase project's SQL editor (Dashboard → SQL Editor
-- → New query → paste this whole file → Run). It creates a single-row table
-- that holds one JSON snapshot of the whole app's saved data, gated by a
-- shared passcode that is checked INSIDE Postgres — the app's public Anon key
-- alone cannot read or write this table; only the two functions below can,
-- and only when the passcode matches.
--
-- To change the passcode later, edit 'your-passcode-here' below and re-run
-- just the INSERT ... ON CONFLICT block.

-- Needed for secure passcode hashing (bcrypt via crypt()/gen_salt()).
create extension if not exists pgcrypto;

create table if not exists ucc_workspace_sync (
  id int primary key default 1,
  passcode_hash text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint ucc_workspace_sync_single_row check (id = 1)
);

-- Row Level Security, with NO policies defined below: this denies the anon
-- role ANY direct access to the table via the REST API. The only way in or
-- out is through the two SECURITY DEFINER functions further down.
alter table ucc_workspace_sync enable row level security;

-- Seed (or reset) the single row and its passcode. CHANGE THE PASSCODE BELOW
-- before running, then re-run this block any time you want to change it.
insert into ucc_workspace_sync (id, passcode_hash, data)
values (1, crypt('your-passcode-here', gen_salt('bf')), '{}'::jsonb)
on conflict (id) do update set passcode_hash = excluded.passcode_hash;

-- Loads the saved snapshot. Raises an error if the passcode is wrong, so the
-- app can tell "wrong passcode" apart from "network/config problem".
create or replace function workspace_sync_load(p_passcode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_data jsonb;
begin
  select passcode_hash, data into v_hash, v_data from ucc_workspace_sync where id = 1;
  if v_hash is null or not (v_hash = crypt(p_passcode, v_hash)) then
    raise exception 'invalid passcode';
  end if;
  return v_data;
end;
$$;

-- Saves a new snapshot (fully replaces the stored data). Same passcode check.
create or replace function workspace_sync_save(p_passcode text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  select passcode_hash into v_hash from ucc_workspace_sync where id = 1;
  if v_hash is null or not (v_hash = crypt(p_passcode, v_hash)) then
    raise exception 'invalid passcode';
  end if;
  update ucc_workspace_sync set data = p_data, updated_at = now() where id = 1;
end;
$$;

-- Let the app's public Anon key call these two passcode-gated functions...
grant execute on function workspace_sync_load(text) to anon;
grant execute on function workspace_sync_save(text, jsonb) to anon;

-- ...but not touch the table directly (RLS is on and no policy grants access).
revoke all on ucc_workspace_sync from anon;
