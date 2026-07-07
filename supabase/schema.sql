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

-- ===========================================================================
-- Saved Items + folders (the "file manager" for tracker outputs)
-- ===========================================================================
-- Two tables shared by every tool: folders (nestable) and saved items. An item
-- carries its tool_id (matches the tool registry, e.g. "timetable") and a JSON
-- payload holding everything needed to restore that tool's state. Same open
-- access model as above — the Anon key can read/write; keep the Project URL
-- private. Deleting a folder moves its contents to root (folder_id / parent_id
-- become null via ON DELETE SET NULL) — it never cascade-deletes items.

create table if not exists ucc_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references ucc_folders (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ucc_saved_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tool_id text not null,
  folder_id uuid references ucc_folders (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ucc_folders_parent_idx on ucc_folders (parent_id);
create index if not exists ucc_saved_items_tool_idx on ucc_saved_items (tool_id);
create index if not exists ucc_saved_items_folder_idx on ucc_saved_items (folder_id);

-- Generic updated_at trigger, reused by both tables.
create or replace function ucc_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ucc_folders_touch on ucc_folders;
create trigger ucc_folders_touch
before update on ucc_folders
for each row execute function ucc_touch_updated_at();

drop trigger if exists ucc_saved_items_touch on ucc_saved_items;
create trigger ucc_saved_items_touch
before update on ucc_saved_items
for each row execute function ucc_touch_updated_at();

-- RLS on, with open policies so the Anon key can manage folders and items.
alter table ucc_folders enable row level security;
alter table ucc_saved_items enable row level security;

drop policy if exists "anon all" on ucc_folders;
drop policy if exists "anon all" on ucc_saved_items;

create policy "anon all" on ucc_folders     for all using (true) with check (true);
create policy "anon all" on ucc_saved_items for all using (true) with check (true);

grant select, insert, update, delete on ucc_folders     to anon;
grant select, insert, update, delete on ucc_saved_items to anon;
