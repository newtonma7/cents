alter table public.canonical_listings
  add constraint canonical_listings_garment_type_check check (
    garment_type is null or garment_type in (
      'top', 'shirt', 'knitwear', 'outerwear', 'trousers', 'shorts', 'skirt',
      'dress', 'jumpsuit', 'other_apparel'
    )
  ),
  add constraint canonical_listings_size_system_check check (
    size_system is null or size_system in ('US', 'UK', 'EU', 'International', 'One size')
  ),
  add constraint canonical_listings_size_label_length check (
    size_label is null or char_length(size_label) <= 80
  ),
  add constraint canonical_listings_brand_length check (
    brand is null or char_length(brand) <= 160
  );

grant insert (garment_type, size_system, size_label, condition, brand, price_usd_cents)
  on public.canonical_listings to authenticated;
grant update (title, description, garment_type, size_system, size_label, condition, brand, price_usd_cents)
  on public.canonical_listings to authenticated;

create policy "Sellers can update their canonical listings"
  on public.canonical_listings
  for update
  to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

create or replace function public.set_canonical_listing_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.seller_id is distinct from old.seller_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Canonical Listing identity is immutable' using errcode = '42501';
  end if;
  new.revision = old.revision + 1;
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
