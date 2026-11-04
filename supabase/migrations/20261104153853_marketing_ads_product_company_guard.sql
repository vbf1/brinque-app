-- Ensure marketing ads can only reference products owned by the same company.
-- Existing product deletion behavior is preserved by the original product_id FK.
drop policy if exists marketing_ads_insert_admin on public.marketing_ads;
create policy marketing_ads_insert_admin
on public.marketing_ads
for insert
to authenticated
with check (
  public.is_company_member(company_id)
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.company_members cm
    where cm.company_id = marketing_ads.company_id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner', 'admin')
  )
  and (
    product_id is null
    or exists (
      select 1
      from public.products p
      where p.id = marketing_ads.product_id
        and p.company_id = marketing_ads.company_id
    )
  )
);

drop policy if exists marketing_ads_update_admin on public.marketing_ads;
create policy marketing_ads_update_admin
on public.marketing_ads
for update
to authenticated
using (
  public.is_company_member(company_id)
  and exists (
    select 1
    from public.company_members cm
    where cm.company_id = marketing_ads.company_id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner', 'admin')
  )
)
with check (
  public.is_company_member(company_id)
  and exists (
    select 1
    from public.company_members cm
    where cm.company_id = marketing_ads.company_id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner', 'admin')
  )
  and (
    product_id is null
    or exists (
      select 1
      from public.products p
      where p.id = marketing_ads.product_id
        and p.company_id = marketing_ads.company_id
    )
  )
);
