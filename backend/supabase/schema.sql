-- TerraSight persistence — mirrors the frozen API contract.
-- Dashboard reads publicly (anon); the rover/backend writes via service_role
-- (service_role bypasses RLS, so no write policy is needed or wanted).

create table if not exists tiles (
  id           bigint generated always as identity primary key,
  x            int  not null,
  y            int  not null,
  z            real not null default 0,
  terrain_class text not null,
  slope        real not null,
  safety_score real not null,
  zone         smallint not null check (zone between 0 and 3),
  updated_at   timestamptz not null default now(),
  unique (x, y)
);

create table if not exists rover_path (
  t        int  primary key,
  x        real not null,
  y        real not null,
  heading  real not null,
  mode     text not null
);

create table if not exists sites (
  id           text primary key,
  x            real not null,
  y            real not null,
  safety_score real not null,
  rank         int  not null
);

create table if not exists boundaries (
  id       bigint generated always as identity primary key,
  type     text  not null,        -- 'crater' | 'waterbed' | 'mineral_edge'
  polyline jsonb not null
);

-- RLS: exposed schema => enable on every table, then allow public read only.
alter table tiles      enable row level security;
alter table rover_path enable row level security;
alter table sites      enable row level security;
alter table boundaries enable row level security;

create policy "public read tiles"      on tiles      for select to anon, authenticated using (true);
create policy "public read rover_path" on rover_path for select to anon, authenticated using (true);
create policy "public read sites"      on sites      for select to anon, authenticated using (true);
create policy "public read boundaries" on boundaries for select to anon, authenticated using (true);
