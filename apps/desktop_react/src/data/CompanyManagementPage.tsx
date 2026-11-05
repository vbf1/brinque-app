import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type Company = { id: string; name: string };
type Member = { id: string; user_id: string; role: string; created_at: string; email: string; full_name: string };
type Props = {
  companies: Company[];
  selectedCompanyId: string;
  userId: string;
  onCompanySelected: (company: Company) => void;
  onCompaniesChanged: (companies: Company[]) => void;
};

export function CompanyManagementPage({ companies, selectedCompanyId, userId, onCompanySelected, onCompaniesChanged }: Props) {
  const selected = companies.find(company => company.id === selectedCompanyId) ?? companies[0] ?? null;
  const [newCompanyName, setNewCompanyName] = useState('');
  const [companyName, setCompanyName] = useState(selected?.name ?? '');
  const [members, setMembers] = useState<Member[]>([]);
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<'staff' | 'admin'>('staff');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => setCompanyName(selected?.name ?? ''), [selected?.id, selected?.name]);

  const loadMembers = useCallback(async () => {
    if (!selected) { setMembers([]); return; }
    setLoading(true); setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('manage-employees', {
        body: { action: 'list', company_id: selected.id },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setMembers((data?.members ?? []) as Member[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os funcionários.');
    } finally { setLoading(false); }
  }, [selected?.id]);

  useEffect(() => { void loadMembers(); }, [loadMembers]);

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newCompanyName.trim();
    if (!name) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const { data, error: insertError } = await supabase.from('companies')
        .insert({ name, created_by: userId }).select('id,name').single();
      if (insertError) throw insertError;
      const next = [...companies, data as Company].sort((a, b) => a.name.localeCompare(b.name));
      onCompaniesChanged(next);
      onCompanySelected(data as Company);
      setNewCompanyName('');
      setMessage('Empresa criada com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a empresa.');
    } finally { setSaving(false); }
  }

  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !companyName.trim()) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const name = companyName.trim();
      const { error: updateError } = await supabase.from('companies')
        .update({ name, updated_at: new Date().toISOString() }).eq('id', selected.id);
      if (updateError) throw updateError;
      const next = companies.map(item => item.id === selected.id ? { ...item, name } : item);
      onCompaniesChanged(next);
      onCompanySelected({ ...selected, name });
      setMessage('Dados da empresa atualizados.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar a empresa.');
    } finally { setSaving(false); }
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('manage-employees', {
        body: { action: 'invite', company_id: selected.id, name: memberName.trim(), email: memberEmail.trim(), role: memberRole },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setMemberName(''); setMemberEmail('');
      setMessage(data?.message || 'Convite enviado.');
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível convidar o usuário.');
    } finally { setSaving(false); }
  }

  async function changeRole(member: Member, role: 'staff' | 'admin') {
    if (!selected) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('manage-employees', {
        body: { action: 'change_role', company_id: selected.id, user_id: member.user_id, role },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setMessage('Permissão atualizada.');
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar a permissão.');
    } finally { setSaving(false); }
  }

  async function removeMember(member: Member) {
    if (!selected || !window.confirm('Remover o acesso deste usuário à empresa?')) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('manage-employees', {
        body: { action: 'remove', company_id: selected.id, user_id: member.user_id },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setMessage('Acesso removido desta empresa.');
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível remover o acesso.');
    } finally { setSaving(false); }
  }

  return <section className="module-content users-page">
    <div className="module-header"><div><h2>Gerenciar empresa e usuários</h2><p className="module-description">Área exclusiva do proprietário global para administrar empresas, administradores e funcionários.</p></div></div>

    <form className="customer-form" onSubmit={createCompany}>
      <h3>Adicionar nova empresa</h3>
      <label>Nome da empresa<input value={newCompanyName} onChange={event => setNewCompanyName(event.target.value)} maxLength={120} required placeholder="Digite o nome da empresa" /></label>
      <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Criar empresa'}</button></div>
    </form>

    <div className="module-header" style={{ marginTop: 24 }}><div><h2>Empresas cadastradas ({companies.length})</h2><p className="module-description">Selecione uma empresa para editar seus dados e gerenciar sua equipe.</p></div></div>
    <div className="users-filters">
      <select aria-label="Selecionar empresa" value={selected?.id ?? ''} onChange={event => { const item = companies.find(company => company.id === event.target.value); if (item) onCompanySelected(item); }}>
        {companies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </div>

    {selected ? <>
      <form className="customer-form" onSubmit={saveCompany}>
        <h3>Dados da empresa selecionada</h3>
        <label>Nome<input value={companyName} onChange={event => setCompanyName(event.target.value)} maxLength={120} required /></label>
        <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar empresa'}</button></div>
      </form>

      <div className="module-header" style={{ marginTop: 28 }}><div><h2>Equipe de {selected.name}</h2><p className="module-description">Convide administradores e funcionários ou ajuste/remova o acesso à empresa.</p></div><button type="button" className="secondary-button" onClick={() => void loadMembers()} disabled={loading}>↻ Atualizar</button></div>
      <form className="customer-form" onSubmit={inviteMember}>
        <h3>Adicionar usuário à empresa</h3>
        <label>Nome<input value={memberName} onChange={event => setMemberName(event.target.value)} minLength={2} maxLength={100} required placeholder="Nome completo" /></label>
        <label>E-mail<input type="email" value={memberEmail} onChange={event => setMemberEmail(event.target.value)} required placeholder="usuario@exemplo.com" /></label>
        <label>Perfil<select value={memberRole} onChange={event => setMemberRole(event.target.value as 'staff' | 'admin')}><option value="staff">Funcionário</option><option value="admin">Administrador</option></select></label>
        <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Processando...' : 'Enviar convite'}</button></div>
      </form>
      {loading ? <p className="module-empty">Carregando equipe...</p> : !members.length ? <p className="module-empty">Nenhum funcionário ou administrador vinculado a esta empresa.</p> : <div className="users-list">{members.map(member => <article className="users-card" key={member.id}>
        <div className="users-card-top"><div className="users-avatar">{(member.full_name || member.email || '?').trim().charAt(0).toUpperCase()}</div><div className="users-primary"><strong>{member.full_name || 'Nome não informado'}</strong><span>{member.email}</span></div><span className={'users-role role-' + member.role}>{member.role === 'admin' ? 'Administrador' : member.role === 'owner' ? 'Proprietário' : 'Funcionário'}</span></div>
        <div className="users-details"><div><small>Vinculado em</small><strong>{new Date(member.created_at).toLocaleDateString('pt-BR')}</strong></div><div><small>Identificador</small><strong>{member.user_id}</strong></div></div>
        {member.role !== 'owner' && <div className="form-actions"><label>Perfil<select value={member.role === 'admin' ? 'admin' : 'staff'} disabled={saving} onChange={event => void changeRole(member, event.target.value as 'staff' | 'admin')}><option value="staff">Funcionário</option><option value="admin">Administrador</option></select></label><button type="button" className="secondary-button" disabled={saving} onClick={() => void removeMember(member)}>Remover acesso</button></div>}
      </article>)}</div>}
    </> : <p className="module-empty">Cadastre a primeira empresa para começar.</p>}
    {error && <p className="module-feedback" role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
    {message && <p className="module-feedback" role="status">{message}</p>}
  </section>;
}
