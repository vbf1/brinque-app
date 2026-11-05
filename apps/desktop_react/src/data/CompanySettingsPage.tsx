import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type CompanyOption = { id: string; name: string };
type Props = {
  companyId: string;
  companyName: string;
  platformOwner: boolean;
  userId: string;
  onSaved: (name: string) => void;
  onCompanyCreated: (company: CompanyOption) => void;
};

export function CompanySettingsPage({ companyId, companyName, platformOwner, userId, onSaved, onCompanyCreated }: Props) {
  const [name, setName] = useState(companyName);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = name.trim();
    if (!value) return setError('Informe o nome da empresa.');
    setSaving(true); setError(''); setMessage('');
    try {
      const { error: updateError } = await supabase.from('companies')
        .update({ name: value, updated_at: new Date().toISOString() })
        .eq('id', companyId);
      if (updateError) throw updateError;
      onSaved(value);
      setMessage('Configurações da empresa atualizadas.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar as configurações.');
    } finally { setSaving(false); }
  }

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = newCompanyName.trim();
    if (!value) return setError('Informe o nome da nova empresa.');
    setCreating(true); setError(''); setMessage('');
    try {
      const { data, error: insertError } = await supabase.from('companies')
        .insert({ name: value, created_by: userId })
        .select('id,name').single();
      if (insertError) throw insertError;
      onCompanyCreated(data as CompanyOption);
      setNewCompanyName('');
      setMessage('Empresa criada e selecionada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a empresa.');
    } finally { setCreating(false); }
  }

  return <section className="module-content">
    <div className="module-header"><div><h2>Configurações da empresa</h2><p className="module-description">Atualize os dados básicos da empresa selecionada.</p></div></div>
    <form className="customer-form" onSubmit={save}>
      <label>Nome da empresa<input value={name} onChange={event => setName(event.target.value)} maxLength={120} required /></label>
      <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button></div>
    </form>
    {platformOwner && <form className="customer-form" onSubmit={createCompany}>
      <h3>Adicionar empresa</h3>
      <p className="module-description">Cadastre outra empresa sem misturar os dados das empresas existentes.</p>
      <label>Nome da nova empresa<input value={newCompanyName} onChange={event => setNewCompanyName(event.target.value)} maxLength={120} required placeholder="Nome da empresa" /></label>
      <div className="form-actions"><button type="submit" disabled={creating}>{creating ? 'Criando...' : 'Criar empresa'}</button></div>
    </form>}
    {error && <p className="module-feedback" role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
    {message && <p className="module-feedback" role="status">{message}</p>}
  </section>;
}
