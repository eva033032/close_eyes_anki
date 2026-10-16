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
