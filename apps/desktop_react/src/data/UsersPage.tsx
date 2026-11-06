import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type AppUser = {
  id: string; name: string; email: string; phone: string; role: string;
  company: string; registered_at: string; last_sign_in_at: string | null;
  email_confirmed_at: string | null; phone_confirmed_at: string | null;
  memberships: Array<{ company: string; role: string }>;
};
type Props = { companyId: string; viewerRole: string };
const roleNames: Record<string, string> = { owner: 'Proprietário', admin: 'Administrador', manager: 'Gerente', staff: 'Funcionário' };
const dateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca';

export function UsersPage({ companyId, viewerRole }: Props) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'staff' | 'manager' | 'admin'>('staff');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const isOwner = viewerRole === 'owner';
  const canManageTeam = isOwner || viewerRole === 'admin';
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('manage-employees', { body: { action: 'list_users', company_id: companyId } });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setUsers((data?.users ?? []) as AppUser[]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar os usuários.'); }
    finally { setLoading(false); }
  }, [companyId]);

  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setNotice(''); setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('manage-employees', {
        body: { action: 'invite', company_id: companyId, name: inviteName.trim(), email: inviteEmail.trim(), role: inviteRole },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setInviteName(''); setInviteEmail(''); setInviteRole('staff');
      setNotice(data?.message || 'Convite enviado com sucesso.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível enviar o convite.'); }
    finally { setSaving(false); }
  }

  async function changeRole(user: AppUser, role: 'staff' | 'manager' | 'admin') {
    setSaving(true); setNotice(''); setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('manage-employees', {
        body: { action: 'change_role', company_id: companyId, user_id: user.id, role },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setNotice('Perfil atualizado com sucesso.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível alterar o perfil.'); }
    finally { setSaving(false); }
  }

  async function removeUser(user: AppUser) {
    if (!window.confirm(`Remover o acesso de ${user.name || user.email} a esta empresa?`)) return;
    setSaving(true); setNotice(''); setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('manage-employees', {
        body: { action: 'remove', company_id: companyId, user_id: user.id },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setNotice('Acesso removido da empresa.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível remover o acesso.'); }
    finally { setSaving(false); }
  }

  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return users.filter(user => {
      const matchesSearch = !term || [user.name,user.email,user.phone,user.company,user.id].some(value => String(value ?? '').toLocaleLowerCase('pt-BR').includes(term));
      return matchesSearch && (roleFilter === 'all' || (roleFilter === 'none' ? !user.role : user.role === roleFilter));
    });
  }, [users, search, roleFilter]);
  const counts = useMemo(() => ({ total: users.length, staff: users.filter(u=>u.role==='staff').length, admins: users.filter(u=>u.role==='admin').length, confirmed: users.filter(u=>!!u.email_confirmed_at).length }), [users]);
  return <section className="module-content users-page">
    <div className="module-header users-toolbar"><div><h2>{isOwner ? 'Equipe da empresa' : 'Funcionários da empresa'}</h2><p>{isOwner ? 'Gerencie todos os usuários, convites e permissões desta empresa.' : 'Consulte e gerencie os funcionários vinculados à sua empresa.'}</p></div><button type="button" className="secondary-button" onClick={()=>void load()} disabled={loading}>↻ Atualizar</button></div>

    {canManageTeam && <form className="customer-form" onSubmit={inviteUser}>
      <h3>Convidar usuário</h3>
      <label>Nome<input value={inviteName} onChange={e=>setInviteName(e.target.value)} minLength={2} maxLength={100} required placeholder="Nome completo" /></label>
      <label>E-mail<input type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} required placeholder="usuario@exemplo.com" /></label>
      <label>Perfil<select value={inviteRole} onChange={e=>setInviteRole(e.target.value as 'staff'|'manager'|'admin')}>
        <option value="staff">Funcionário</option>{isOwner && <><option value="manager">Gerente</option><option value="admin">Administrador</option></>}
      </select></label>
      <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Enviando...' : 'Enviar convite'}</button></div>
    </form>}
    {notice && <p className="module-feedback" role="status">{notice}</p>}
    <div className="users-stats"><article><span>Total exibido</span><strong>{counts.total}</strong></article><article><span>Funcionários</span><strong>{counts.staff}</strong></article><article><span>Administradores</span><strong>{counts.admins}</strong></article><article><span>E-mails confirmados</span><strong>{counts.confirmed}</strong></article></div>
    <div className="users-filters"><input aria-label="Buscar usuário" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome, e-mail, telefone ou empresa..."/><select aria-label="Filtrar por tipo de usuário" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value="all">Todos os perfis</option><option value="owner">Proprietário</option><option value="admin">Administrador</option><option value="manager">Gerente</option><option value="staff">Funcionário</option><option value="none">Sem vínculo com empresa</option></select></div>
    {error && <div className="users-error" role="alert">{error}<button type="button" onClick={()=>void load()}>Tentar novamente</button></div>}
    {loading ? <p className="module-empty">Carregando usuários...</p> : !filtered.length ? <p className="module-empty">Nenhum usuário encontrado com esses filtros.</p> : <div className="users-list">{filtered.map(user=><article className="users-card" key={user.id}>
      <div className="users-card-top"><div className="users-avatar">{(user.name||user.email||'?').trim().charAt(0).toUpperCase()}</div><div className="users-primary"><strong>{user.name||'Nome não informado'}</strong><span>{user.email||'E-mail não informado'}</span></div><span className={'users-role role-'+(user.role||'none')}>{roleNames[user.role]||'Sem vínculo'}</span></div>
      <div className="users-details"><div><small>Telefone</small><strong>{user.phone||'Não informado'}</strong></div><div><small>Empresa</small><strong>{user.company||'Sem empresa vinculada'}</strong></div><div><small>Data de cadastro</small><strong>{dateTime(user.registered_at)}</strong></div><div><small>Último acesso</small><strong>{dateTime(user.last_sign_in_at)}</strong></div><div><small>Confirmação do e-mail</small><strong className={user.email_confirmed_at?'users-good':'users-pending'}>{user.email_confirmed_at?'Confirmado':'Pendente'}</strong></div><div><small>Telefone confirmado</small><strong>{user.phone_confirmed_at?'Sim':'Não'}</strong></div>
      {isOwner && user.memberships?.length>1 && <div className="users-memberships"><small>Vínculos e perfis</small><strong>{user.memberships.map(item=>item.company+' · '+(roleNames[item.role]||item.role)).join(' | ')}</strong></div>}
      <div className="users-id"><small>ID da conta</small><strong>{user.id}</strong></div></div>
      {canManageTeam && user.role !== 'owner' && (isOwner || user.role === 'staff') && <div className="form-actions">
        {isOwner && <label>Perfil<select value={user.role === 'admin' ? 'admin' : user.role === 'manager' ? 'manager' : 'staff'} disabled={saving} onChange={e=>void changeRole(user, e.target.value as 'staff'|'admin')}>
          <option value="staff">Funcionário</option><option value="manager">Gerente</option><option value="admin">Administrador</option>
        </select></label>}
        <button type="button" className="secondary-button" disabled={saving} onClick={()=>void removeUser(user)}>Remover acesso</button>
      </div>}
    </article>)}</div>}
    {!loading && <p className="users-count">Exibindo {filtered.length} de {users.length} usuários.</p>}
  </section>;
}
