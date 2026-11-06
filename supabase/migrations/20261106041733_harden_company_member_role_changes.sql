-- Harden company-member role changes.
-- Admins may manage staff/manager but cannot promote or modify another admin.
-- The owner role cannot be modified through this RPC.

create or replace function public.add_company_member(
  p_company_id uuid,
  p_user_id uuid,
  p_role text default 'staff'
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_existing_role text;
  v_actor_is_owner boolean;
  v_actor_is_admin boolean;
begin
  v_actor_is_owner := public.has_company_role(p_company_id, array['owner']::text[]);
  v_actor_is_admin := public.has_company_role(p_company_id, array['admin']::text[]);

  if not (v_actor_is_owner or v_actor_is_admin) then
    raise exception 'Sem permissão para gerenciar usuários desta empresa.';
  end if;

  if p_role not in ('admin','manager','staff') then
    raise exception 'Perfil inválido. O perfil owner não pode ser atribuído por esta função.';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'Usuário não encontrado em Authentication.';
  end if;

  select cm.role into v_existing_role
  from public.company_members cm
  where cm.company_id = p_company_id and cm.user_id = p_user_id
  for update;

  if v_existing_role = 'owner' then
    raise exception 'O perfil do proprietário não pode ser alterado por esta função.';
  end if;

  if v_actor_is_admin and not v_actor_is_owner then
    if p_role = 'admin' then
      raise exception 'Somente o proprietário pode promover outro administrador.';
    end if;
    if v_existing_role = 'admin' then
      raise exception 'Somente o proprietário pode alterar o perfil de outro administrador.';
    end if;
  end if;

  insert into public.company_members (company_id, user_id, role)
  values (p_company_id, p_user_id, p_role)
  on conflict (company_id, user_id)
  do update set role = excluded.role;
end;
$function$;
