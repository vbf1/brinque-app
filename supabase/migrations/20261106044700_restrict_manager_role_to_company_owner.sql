-- Restrict manager and administrator role assignment to company owners.
-- Company admins can invite/manage staff only; owners retain full company control.
create or replace function public.add_company_member(p_company_id uuid, p_user_id uuid, p_role text default 'staff'::text)
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
    if p_role <> 'staff' then
      raise exception 'Somente o proprietário pode atribuir os perfis gerente ou administrador.';
    end if;
    if v_existing_role is not null and v_existing_role <> 'staff' then
      raise exception 'Administradores só podem gerenciar funcionários.';
    end if;
  end if;

  insert into public.company_members (company_id, user_id, role)
  values (p_company_id, p_user_id, p_role)
  on conflict (company_id, user_id)
  do update set role = excluded.role;
end;
$function$;

insert into supabase_migrations.schema_migrations(version, name, statements)
values ('20261106044700', 'restrict_manager_role_to_company_owner', array['create or replace function public.add_company_member(...)']);
