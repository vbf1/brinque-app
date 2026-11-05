import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type Props = {
  companyId: string;
  companyName: string;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  onSaved: (name: string) => void;
};

export function CompanySettingsPage({ companyId, companyName, theme, onThemeChange, onSaved }: Props) {
  const [name, setName] = useState(companyName);
  const [saving, setSaving] = useState(false);
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
      setMessage('Dados da empresa atualizados.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar as configurações.');
    } finally { setSaving(false); }
  }

  return <section className="module-content">
    <div className="module-header"><div><h2>Configurações</h2><p className="module-description">Personalize a experiência do KidsLoc e ajuste os dados da sua empresa.</p></div></div>

    <section className="customer-form" aria-labelledby="appearance-settings-title">
      <h3 id="appearance-settings-title">Aparência do sistema</h3>
      <p className="module-description">Escolha como deseja visualizar o KidsLoc. Essa preferência fica salva neste dispositivo.</p>
      <label> Tema da interface
        <select value={theme} onChange={event => onThemeChange(event.target.value as 'light' | 'dark')}>
          <option value="light">Claro</option>
          <option value="dark">Escuro</option>
        </select>
      </label>
    </section>

    <form className="customer-form" onSubmit={save}>
      <h3>Dados da empresa</h3>
      <p className="module-description">Atualize o nome que aparece no sistema e nos espaços vinculados à empresa.</p>
      <label>Nome da empresa<input value={name} onChange={event => setName(event.target.value)} maxLength={120} required /></label>
      <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button></div>
    </form>

    <section className="customer-form" aria-labelledby="future-settings-title">
      <h3 id="future-settings-title">Mais opções de personalização</h3>
      <p className="module-description">As próximas opções serão adicionadas aqui gradualmente, sem alterar o funcionamento das áreas atuais.</p>
      <ul>
        <li>Preferências da agenda e formato de datas.</li>
        <li>Escolha dos avisos e notificações recebidos.</li>
        <li>Organização dos atalhos e informações da tela inicial.</li>
      </ul>
    </section>

    {error && <p className="module-feedback" role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
    {message && <p className="module-feedback" role="status">{message}</p>}
  </section>;
}
