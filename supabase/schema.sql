-- UCC Workspace — cloud sync schema.
--
-- Run this ONCE in your Supabase project's SQL editor (Dashboard → SQL Editor
-- → New query → paste this whole file → Run). It creates a single-row table
-- that holds one JSON snapshot of the whole app's saved data.
--
-- SECURITY NOTE: there is no extra passcode here. Anyone who has this
-- project's URL and Anon/publishable key can read or overwrite everything in
-- this table — the Anon key is not really secret (it ships in the app's
-- public JS bundle), so treat the Project URL itself as the thing to keep
-- private. This is a simple shared-team convenience, appropriate for a small
-- internal tool — not a substitute for real per-user access control.

create table if not exists ucc_workspace_sync (
  id int primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint ucc_workspace_sync_single_row check (id = 1)
);

-- Create the one row this app reads/writes, if it doesn't already exist.
insert into ucc_workspace_sync (id, data) values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- Keep updated_at current automatically on every save.
create or replace function ucc_workspace_sync_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ucc_workspace_sync_touch_trigger on ucc_workspace_sync;
create trigger ucc_workspace_sync_touch_trigger
before update on ucc_workspace_sync
for each row execute function ucc_workspace_sync_touch();

-- Row Level Security must be enabled for the anon role to be usable at all
-- via the REST API; these two open policies let the app's Anon key read and
-- update the row directly (see the security note above).
alter table ucc_workspace_sync enable row level security;

drop policy if exists "anon can read"   on ucc_workspace_sync;
drop policy if exists "anon can update" on ucc_workspace_sync;

create policy "anon can read"   on ucc_workspace_sync for select using (true);
create policy "anon can update" on ucc_workspace_sync for update using (true) with check (true);

grant select, update on ucc_workspace_sync to anon;
