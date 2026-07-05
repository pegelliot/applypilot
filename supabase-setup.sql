create table if not exists public.applypilot_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.applypilot_workspaces enable row level security;

drop policy if exists "Users can read their own ApplyPilot workspace" on public.applypilot_workspaces;
create policy "Users can read their own ApplyPilot workspace"
on public.applypilot_workspaces
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own ApplyPilot workspace" on public.applypilot_workspaces;
create policy "Users can insert their own ApplyPilot workspace"
on public.applypilot_workspaces
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own ApplyPilot workspace" on public.applypilot_workspaces;
create policy "Users can update their own ApplyPilot workspace"
on public.applypilot_workspaces
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own ApplyPilot workspace" on public.applypilot_workspaces;
create policy "Users can delete their own ApplyPilot workspace"
on public.applypilot_workspaces
for delete
to authenticated
using (auth.uid() = user_id);
