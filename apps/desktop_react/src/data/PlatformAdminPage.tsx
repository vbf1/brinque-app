import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { AppSelect } from '../components/AppSelect';
import { AppConfirmDialog } from '../components/AppConfirmDialog';

type Company = { id: string; name: string };
type Membership = { id: string; company_id: string; company: string; role: string };
type PlatformUser = {
  id: string; name: string; email: string; phone: string; role: string; company: string;
  registered_at: string; last_sign_in_at: string | null; email_confirmed_at: string | null;
  phone_confirmed_at: string | null; memberships: Membership[];
};
type Props = {
  currentCompanyId: string;
  companies: Company[];
  onCompaniesChanged: (companies: Company[]) => void;
  onSelectCompany: (company: Company) => void;
};
const roles = [
  { value: 'staff', label: 'Funcionário' },
  { value: 'manager', label: 'Gerente' },
  { value: 'admin', label: 'Administrador' },
  { value: 'owner', label: 'Proprietário da empresa' },
];
const dateLabel = (value?: string | null) => value
  ? new Date(value).toLocaleDateString('pt-BR') : 'Nunca';

export function PlatformAdminPage({ currentCompanyId, companies, onCompaniesChanged, onSelectCompany }: Props) {
  const [tab, setTab] = useState<'companies' | 'users'>('companies');
  const [companyName, setCompanyName] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [savingCompany, setSavingCompany] = useState('');
  const [companyError, setCompanyError] = useState('');
  const [companyMessage, setCompanyMessage] = useState('');
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [managementReady, setManagementReady] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [newMembershipUser, setNewMembershipUser] = useState('');
  const [newMembershipCompany, setNewMembershipCompany] = useState(currentCompanyId);
  const [newMembershipRole, setNewMembershipRole] = useState('staff');
  const [membershipBusy, setMembershipBusy] = useState('');
  const [membershipMessage, setMembershipMessage] = useState('');
  const [confirmMembership, setConfirmMembership] = useState<Membership | null>(null);
  const [expandedCompanyIds, setExpandedCompanyIds] = useState<string[]>([]);

  const loadUsers = useCallback(async () => {
    if (!currentCompanyId) return;
    setUsersLoading(true);
    setUsersError('');
    setManagementReady(false);
    try {
      const { data, error } = await supabase.functions.invoke('manage-employees', {
        body: { action: 'list_users', company_id: currentCompanyId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setManagementReady(data?.management_version === 2);
      setUsers((data?.users ?? []) as PlatformUser[]);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : 'Não foi possível carregar as contas.');
    } finally {
      setUsersLoading(false);
    }
  }, [currentCompanyId]);

  useEffect(() => { if (tab === 'users') void loadUsers(); }, [tab, loadUsers]);
  useEffect(() => { setNewMembershipCompany(currentCompanyId); }, [currentCompanyId]);

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLocaleLowerCase('pt-BR');
    if (!term) return users;
    return users.filter(user => [user.name, user.email, user.phone, user.id]
      .some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(term)));
  }, [users, userSearch]);

  const toggleCompany = (companyId: string) => setExpandedCompanyIds(current =>
    current.includes(companyId) ? current.filter(id => id !== companyId) : [...current, companyId]
  );
  const companyUserGroups = useMemo(() => companies.map(company => ({
    company,
    users: filteredUsers.filter(user => user.memberships?.some(membership => membership.company_id === company.id)),
  })).filter(group => group.users.length > 0), [companies, filteredUsers]);
  const usersWithoutCompany = filteredUsers.filter(user => !user.memberships?.length);

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = companyName.trim();
    if (!name) return;
    setCreatingCompany(true); setCompanyError(''); setCompanyMessage('');
    try {
      const { data, error } = await supabase.from('companies')
        .insert({ name, created_by: (await supabase.auth.getUser()).data.user?.id })
        .select('id,name').single();
      if (error) throw error;
      const next = [...companies, data as Company].sort((a, b) => a.name.localeCompare(b.name));
      onCompaniesChanged(next);
      onSelectCompany(data as Company);
      setCompanyName('');
      setCompanyMessage('Empresa cadastrada com sucesso.');
    } catch (error) {
      setCompanyError(error instanceof Error ? error.message : 'Não foi possível cadastrar a empresa.');
    } finally { setCreatingCompany(false); }
  }

  async function renameCompany(event: FormEvent<HTMLFormElement>, company: Company) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem('company-name') as HTMLInputElement | null;
    const name = input?.value.trim() || '';
    if (!name) return setCompanyError('Informe o nome da empresa.');
    setSavingCompany(company.id); setCompanyError(''); setCompanyMessage('');
    try {
      const { error } = await supabase.from('companies')
        .update({ name, updated_at: new Date().toISOString() }).eq('id', company.id);
      if (error) throw error;
      const next = companies.map(item => item.id === company.id ? { ...item, name } : item)
        .sort((a, b) => a.name.localeCompare(b.name));
      onCompaniesChanged(next);
      if (currentCompanyId === company.id) onSelectCompany({ id: company.id, name });
      setCompanyMessage('Nome da empresa atualizado.');
    } catch (error) {
      setCompanyError(error instanceof Error ? error.message : 'Não foi possível atualizar a empresa.');
    } finally { setSavingCompany(''); }
  }

  async function membershipAction(action: string, payload: Record<string, string>, key: string) {
    if (!managementReady) {
      setMembershipMessage('As ações de gerenciamento de usuários aguardam a publicação da atualização segura do serviço.');
      return;
    }
    setMembershipBusy(key); setMembershipMessage('');
    try {
      const { data, error } = await supabase.functions.invoke('manage-employees', {
        body: { action, company_id: currentCompanyId, ...payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMembershipMessage(data?.message || 'Alteração concluída.');
      await loadUsers();
    } catch (error) {
      setMembershipMessage(error instanceof Error ? error.message : 'Não foi possível concluir a alteração.');
    } finally { setMembershipBusy(''); }
  }

  async function addMembership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newMembershipUser || !newMembershipCompany) return;
    await membershipAction('platform_add_membership', {
      user_id: newMembershipUser, target_company_id: newMembershipCompany, role: newMembershipRole,
    }, 'add');
  }

  return <section className="module-content platform-admin-page">
    <AppConfirmDialog open={!!confirmMembership} title="Remover vínculo da empresa?" description={confirmMembership ? "A conta deixará de ter acesso à empresa " + confirmMembership.company + ". A conta de usuário continuará existindo." : ""} confirmLabel="Remover vínculo" busy={!!membershipBusy} onCancel={() => setConfirmMembership(null)} onConfirm={() => { if (confirmMembership) { const item = confirmMembership; setConfirmMembership(null); void membershipAction("platform_remove_membership", { membership_id: item.id }, item.id); } }} />
    <div className="module-header">
      <div><h2>Administração da plataforma</h2><p className="module-description">Gerencie as empresas cadastradas e os acessos das contas em toda a plataforma.</p></div>
      <span className="users-role role-owner">Proprietário global</span>
    </div>
    <div className="users-filters" role="tablist" aria-label="Área administrativa">
      <button type="button" className={tab === 'companies' ? 'primary-button' : 'secondary-button'} onClick={() => setTab('companies')}>Empresas ({companies.length})</button>
      <button type="button" className={tab === 'users' ? 'primary-button' : 'secondary-button'} onClick={() => setTab('users')}>Usuários</button>
    </div>

    {tab === 'companies' && <>
      <form className="customer-form" onSubmit={createCompany}>
        <h3>Cadastrar empresa</h3>
        <label>Nome da empresa<input value={companyName} onChange={event => setCompanyName(event.target.value)} maxLength={120} required placeholder="Nome da nova empresa" /></label>
        <div className="form-actions"><button type="submit" disabled={creatingCompany}>{creatingCompany ? 'Cadastrando...' : 'Cadastrar empresa'}</button></div>
      </form>
      <div className="module-header"><div><h3>Empresas cadastradas</h3><p className="module-description">Selecione uma empresa para abrir sua operação ou altere seu nome.</p></div></div>
      {!companies.length ? <p className="module-empty">Nenhuma empresa cadastrada.</p> : <div className="users-list">
        {companies.map(company => <article className="users-card" key={company.id}>
          <form onSubmit={event => void renameCompany(event, company)}>
            <div className="users-card-top">
              <div className="users-avatar">{company.name.trim().charAt(0).toUpperCase()}</div>
              <div className="users-primary"><strong>{company.name}</strong><span>{company.id}</span></div>
              {currentCompanyId === company.id && <span className="users-role role-owner">Em uso</span>}
            </div>
            <div className="users-details">
              <label style={{ display: 'grid', gap: 6, flex: '1 1 240px' }}>Nome da empresa<input name="company-name" defaultValue={company.name} maxLength={120} required /></label>
              <div className="form-actions">
                <button type="submit" disabled={savingCompany === company.id}>{savingCompany === company.id ? 'Salvando...' : 'Salvar nome'}</button>
                <button type="button" className="secondary-button" onClick={() => onSelectCompany(company)}>Abrir empresa</button>
              </div>
            </div>
          </form>
        </article>)}
      </div>}
      {companyError && <p className="module-feedback" role="alert" style={{ color: 'var(--red)' }}>{companyError}</p>}
      {companyMessage && <p className="module-feedback" role="status">{companyMessage}</p>}
    </>}

    {tab === 'users' && <>
      <div className="users-stats">
        <article><span>Contas cadastradas</span><strong>{users.length}</strong></article>
        <article><span>Com vínculo</span><strong>{users.filter(user => user.memberships?.length).length}</strong></article>
        <article><span>Sem vínculo</span><strong>{users.filter(user => !user.memberships?.length).length}</strong></article>
        <article><span>E-mail confirmado</span><strong>{users.filter(user => !!user.email_confirmed_at).length}</strong></article>
      </div>
      {!managementReady && <div className="users-error" role="status">A listagem está disponível, mas as alterações de vínculos e perfis aguardam a publicação da atualização segura do serviço de usuários.</div>}
      <details className="platform-admin-action">
        <summary>＋ Vincular uma conta a uma empresa</summary>
        <form className="customer-form" onSubmit={addMembership}>
          <p className="module-description">Vincule uma conta já cadastrada e escolha o nível de acesso. Isso não cria uma nova conta nem envia convite.</p>
          <label>Conta<AppSelect value={newMembershipUser} onChange={setNewMembershipUser} required placeholder="Selecione uma conta" options={users.map(user => ({ value: user.id, label: `${user.name || user.email} · ${user.email}` }))} /></label>
          <label>Empresa<AppSelect value={newMembershipCompany} onChange={setNewMembershipCompany} required placeholder="Selecione uma empresa" options={companies.map(company => ({ value: company.id, label: company.name }))} /></label>
          <label>Perfil<AppSelect value={newMembershipRole} onChange={setNewMembershipRole} options={roles} placeholder="Selecione o perfil" /></label>
          <div className="form-actions"><button type="submit" disabled={!managementReady || membershipBusy === 'add' || !newMembershipUser || !newMembershipCompany}>{membershipBusy === 'add' ? 'Vinculando...' : 'Vincular usuário'}</button></div>
        </form>
      </details>
      <div className="users-filters"><input aria-label="Buscar conta" value={userSearch} onChange={event => setUserSearch(event.target.value)} placeholder="Buscar por nome, e-mail, telefone ou ID..." /><button type="button" className="secondary-button" onClick={() => void loadUsers()} disabled={usersLoading}>↻ Atualizar</button></div>
      {usersError && <div className="users-error" role="alert">{usersError}<button type="button" onClick={() => void loadUsers()}>Tentar novamente</button></div>}
      {usersLoading ? <p className="module-empty">Carregando contas...</p> : !filteredUsers.length ? <p className="module-empty">Nenhuma conta encontrada.</p> : <div className="platform-company-groups">
        {companyUserGroups.map(({ company, users: companyUsers }) => {
          const expanded = expandedCompanyIds.includes(company.id);
          return <section className="platform-company-group" key={company.id}>
            <button type="button" className="platform-company-heading" aria-expanded={expanded} onClick={() => toggleCompany(company.id)}>
              <span className="platform-company-heading-main"><span className="platform-company-avatar">{company.name.trim().charAt(0).toUpperCase()}</span><span><strong>{company.name}</strong><small>{companyUsers.length} {companyUsers.length === 1 ? 'usuário' : 'usuários'}</small></span></span>
              <span className="platform-company-heading-action">{expanded ? 'Recolher −' : 'Ver usuários +'}</span>
            </button>
            {expanded && <div className="users-list">
              {companyUsers.map(user => {
                const membership = user.memberships.find(item => item.company_id === company.id);
                if (!membership) return null;
                return <article className="users-card" key={user.id}>
                  <div className="users-card-top"><div className="users-avatar">{(user.name || user.email || '?').trim().charAt(0).toUpperCase()}</div><div className="users-primary"><strong>{user.name || 'Nome não informado'}</strong><span>{user.email}</span></div><span className={user.email_confirmed_at ? 'users-role role-owner' : 'users-role role-none'}>{user.email_confirmed_at ? 'E-mail confirmado' : 'E-mail pendente'}</span></div>
                  <div className="users-details"><div><small>Telefone</small><strong>{user.phone || 'Não informado'}</strong></div><div><small>Cadastro</small><strong>{dateLabel(user.registered_at)}</strong></div><div><small>Último acesso</small><strong>{dateLabel(user.last_sign_in_at)}</strong></div></div>
                  <div className="users-memberships"><div className="users-details">
                    <div><small>Empresa</small><strong>{company.name}</strong></div>
                    <label className="membership-role-field">Perfil<AppSelect value={membership.role} onChange={value => void membershipAction('platform_change_membership', { membership_id: membership.id, role: value }, membership.id)} disabled={!managementReady || !!membershipBusy} options={roles} placeholder="Perfil" /></label>
                    <button type="button" className="secondary-button" disabled={!managementReady || !!membershipBusy || membership.role === 'owner'} onClick={() => setConfirmMembership(membership)}>{membershipBusy === membership.id ? 'Processando...' : 'Remover vínculo'}</button>
                  </div></div>
                </article>;
              })}
            </div>}
          </section>;
        })}
        {!!usersWithoutCompany.length && <section className="platform-company-group">
          <button type="button" className="platform-company-heading" aria-expanded={expandedCompanyIds.includes('__unassigned__')} onClick={() => toggleCompany('__unassigned__')}>
            <span className="platform-company-heading-main"><span className="platform-company-avatar">?</span><span><strong>Contas sem empresa</strong><small>{usersWithoutCompany.length} {usersWithoutCompany.length === 1 ? 'conta' : 'contas'}</small></span></span>
            <span className="platform-company-heading-action">{expandedCompanyIds.includes('__unassigned__') ? 'Recolher −' : 'Ver contas +'}</span>
          </button>
          {expandedCompanyIds.includes('__unassigned__') && <div className="users-list">
            {usersWithoutCompany.map(user => <article className="users-card" key={user.id}>
              <div className="users-card-top"><div className="users-avatar">{(user.name || user.email || '?').trim().charAt(0).toUpperCase()}</div><div className="users-primary"><strong>{user.name || 'Nome não informado'}</strong><span>{user.email}</span></div><span className={user.email_confirmed_at ? 'users-role role-owner' : 'users-role role-none'}>{user.email_confirmed_at ? 'E-mail confirmado' : 'E-mail pendente'}</span></div>
              <div className="users-details"><div><small>Telefone</small><strong>{user.phone || 'Não informado'}</strong></div><div><small>Cadastro</small><strong>{dateLabel(user.registered_at)}</strong></div><div><small>Último acesso</small><strong>{dateLabel(user.last_sign_in_at)}</strong></div></div>
            </article>)}
          </div>}
        </section>}
      </div>}
      {membershipMessage && <p className="module-feedback" role="status">{membershipMessage}</p>}
      <p className="users-count">Exibindo {filteredUsers.length} de {users.length} contas cadastradas.</p>
    </>}
  </section>;
}
