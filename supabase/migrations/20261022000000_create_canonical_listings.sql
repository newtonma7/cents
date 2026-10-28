create table public.canonical_listings (
  id uuid primary key,
  seller_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text check (title is null or char_length(title) <= 160),
  description text check (description is null or char_length(description) <= 5000),
  garment_type text,
  size_system text,
  size_label text,
  condition text check (condition is null or condition in ('New', 'Good', 'Fair')),
  brand text,
  price_usd_cents integer check (price_usd_cents is null or price_usd_cents >= 0),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index canonical_listings_seller_created_at_idx
  on public.canonical_listings (seller_id, created_at desc);

alter table public.canonical_listings enable row level security;
alter table public.canonical_listings force row level security;

revoke all on public.canonical_listings from public, anon, authenticated;
grant select on public.canonical_listings to authenticated;
grant insert (id, title, description) on public.canonical_listings to authenticated;

create policy "Sellers can read their canonical listings"
  on public.canonical_listings
  for select
  to authenticated
  using (seller_id = (select auth.uid()));

create policy "Sellers can create their canonical listings"
  on public.canonical_listings
  for insert
  to authenticated
  with check (seller_id = (select auth.uid()));

create function public.set_canonical_listing_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger canonical_listings_set_updated_at
  before update on public.canonical_listings
  for each row execute function public.set_canonical_listing_updated_at();
