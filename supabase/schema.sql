-- PromaRacer: схема Supabase. Выполни целиком в SQL Editor (один раз).
-- Не забудь: Authentication -> Providers -> Email -> выключить "Confirm email".

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 16),
  coins int not null default 10000,
  races int not null default 0,
  wins int not null default 0,
  garage jsonb not null default '{"gtr":{"e":0,"t":0,"a":0}}'::jsonb,   -- машины и уровни апгрейдов
  selected_car text not null default 'gtr',
  bests jsonb not null default '{}'::jsonb,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id bigint generated always as identity primary key,
  requester uuid not null references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  unique (requester, addressee)
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists messages_pair on public.messages (from_id, to_id, created_at);

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.messages enable row level security;

-- профили: читать могут все вошедшие, менять только свой (монеты/гонки меняются через RPC ниже)
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "friends read" on public.friendships;
create policy "friends read" on public.friendships for select to authenticated using (requester = auth.uid() or addressee = auth.uid());
drop policy if exists "friends request" on public.friendships;
create policy "friends request" on public.friendships for insert to authenticated with check (requester = auth.uid() and status = 'pending');
drop policy if exists "friends accept" on public.friendships;
create policy "friends accept" on public.friendships for update to authenticated using (addressee = auth.uid()) with check (addressee = auth.uid());
drop policy if exists "friends delete" on public.friendships;
create policy "friends delete" on public.friendships for delete to authenticated using (requester = auth.uid() or addressee = auth.uid());

drop policy if exists "msg read" on public.messages;
create policy "msg read" on public.messages for select to authenticated using (from_id = auth.uid() or to_id = auth.uid());
drop policy if exists "msg send" on public.messages;
create policy "msg send" on public.messages for insert to authenticated with check (
  from_id = auth.uid() and exists (
    select 1 from public.friendships f where f.status = 'accepted'
    and ((f.requester = auth.uid() and f.addressee = to_id) or (f.addressee = auth.uid() and f.requester = to_id))));

-- Награда за гонку: монеты и счётчики меняются только здесь, с потолком за один вызов.
create or replace function public.award_race(p_coins int, p_won boolean)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare r public.profiles;
begin
  update public.profiles set
    coins = coins + least(greatest(p_coins, 0), 3000),
    races = races + 1,
    wins = wins + (case when p_won then 1 else 0 end)
  where id = auth.uid() returning * into r;
  return r;
end $$;

-- Покупка машины / апгрейда: списание монет на сервере.
create or replace function public.spend_coins(p_cost int, p_garage jsonb)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare r public.profiles;
begin
  if p_cost < 0 then raise exception 'bad cost'; end if;
  update public.profiles set coins = coins - p_cost, garage = p_garage
  where id = auth.uid() and coins >= p_cost returning * into r;
  if r.id is null then raise exception 'not enough coins'; end if;
  return r;
end $$;

grant execute on function public.award_race(int, boolean) to authenticated;
grant execute on function public.spend_coins(int, jsonb) to authenticated;

-- чат в реальном времени
do $$ begin
  alter publication supabase_realtime add table public.messages;
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null; end $$;
