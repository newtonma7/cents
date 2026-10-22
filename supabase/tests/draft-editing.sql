\set ON_ERROR_STOP on

begin;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

insert into public.canonical_listings (
  id, title, description, garment_type, size_system, size_label, condition, brand, price_usd_cents
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', repeat('🧥', 160), 'Draft description',
  'shirt', 'UK', '12', 'Good', 'Draft brand', 29
);

do $$
begin
  if not exists (
    select 1 from public.canonical_listings
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and seller_id = '11111111-1111-4111-8111-111111111111'
      and revision = 1 and price_usd_cents = 29 and created_at = updated_at
  ) then
    raise exception 'Insert defaults or editable field grants failed';
  end if;
end;
$$;

update public.canonical_listings
set title = null, description = null, garment_type = null, size_system = null,
    size_label = 'M', condition = null, brand = null, price_usd_cents = 0
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and revision = 1;

do $$
declare
  changed integer;
begin
  if not exists (
    select 1 from public.canonical_listings
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and revision = 2 and title is null and description is null
      and garment_type is null and size_system is null and size_label = 'M'
      and condition is null and brand is null and price_usd_cents = 0
      and updated_at > created_at
  ) then
    raise exception 'Nullable partial save or server metadata failed';
  end if;

  update public.canonical_listings set title = 'Stale overwrite'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and revision = 1;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Stale revision updated a row'; end if;

  begin
    update public.canonical_listings set revision = 500 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    raise exception 'Revision update was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.canonical_listings set updated_at = now() where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    raise exception 'Timestamp update was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.canonical_listings set seller_id = '22222222-2222-4222-8222-222222222222' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    raise exception 'Ownership update was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.canonical_listings set id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    raise exception 'Identity update was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.canonical_listings set created_at = now() where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    raise exception 'Creation time update was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.canonical_listings (id, revision) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 500);
    raise exception 'Revision insert was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.canonical_listings (id, seller_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '22222222-2222-4222-8222-222222222222');
    raise exception 'Ownership insert was allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.canonical_listings set garment_type = 'marketplace_category' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    raise exception 'Unknown garment type was allowed';
  exception when check_violation then null;
  end;
  begin
    update public.canonical_listings set size_system = 'unknown' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    raise exception 'Unknown size system was allowed';
  exception when check_violation then null;
  end;
  begin
    update public.canonical_listings set condition = 'Mint' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    raise exception 'Unknown condition was allowed';
  exception when check_violation then null;
  end;
  begin
    update public.canonical_listings set price_usd_cents = -1 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    raise exception 'Negative price was allowed';
  exception when check_violation then null;
  end;
  begin
    update public.canonical_listings set title = repeat('🧥', 161) where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    raise exception 'Overlong codepoint title was allowed';
  exception when check_violation then null;
  end;

  update public.canonical_listings set price_usd_cents = null, size_label = null, size_system = 'One size'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and revision = 2;
  if not exists (
    select 1 from public.canonical_listings
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and revision = 3
      and price_usd_cents is null and size_label is null and size_system = 'One size'
  ) then raise exception 'Clear or independent size system save failed'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

do $$
declare
  changed integer;
begin
  if exists (select 1 from public.canonical_listings where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') then
    raise exception 'Foreign Seller read a draft';
  end if;
  update public.canonical_listings set title = 'Foreign overwrite'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and revision = 3;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Foreign Seller updated a draft'; end if;
end;
$$;

reset role;
set local role anon;

do $$
begin
  begin
    perform 1 from public.canonical_listings;
    raise exception 'Anonymous read was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.canonical_listings set title = 'Anonymous overwrite' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    raise exception 'Anonymous update was allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
\echo Draft editing SQL checks passed. All test writes rolled back.
