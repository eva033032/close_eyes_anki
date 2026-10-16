-- Run once in Supabase Dashboard > SQL Editor > New query.
create table if not exists public.user_learning_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_learning_data enable row level security;
revoke all on public.user_learning_data from anon;
grant select, insert, update, delete on public.user_learning_data to authenticated;

drop policy if exists "Users can manage their own learning data" on public.user_learning_data;
create policy "Users can manage their own learning data"
on public.user_learning_data for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Public articles and folders that signed-in users may browse and import.
create table if not exists public.shared_library_items (
  item_id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('article', 'folder')),
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.shared_library_items enable row level security;
revoke all on public.shared_library_items from anon, public;
grant select, insert, update, delete on public.shared_library_items to authenticated;
create index if not exists shared_library_items_owner_id_idx on public.shared_library_items(owner_id);
create index if not exists shared_library_items_updated_at_idx on public.shared_library_items(updated_at desc);

drop policy if exists "Signed-in users can browse shared library" on public.shared_library_items;
create policy "Signed-in users can browse shared library"
on public.shared_library_items for select to authenticated
using (true);

drop policy if exists "Owners can publish shared library items" on public.shared_library_items;
create policy "Owners can publish shared library items"
on public.shared_library_items for insert to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "Owners can update shared library items" on public.shared_library_items;
create policy "Owners can update shared library items"
on public.shared_library_items for update to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Owners can unpublish shared library items" on public.shared_library_items;
create policy "Owners can unpublish shared library items"
on public.shared_library_items for delete to authenticated
using (auth.uid() = owner_id);
