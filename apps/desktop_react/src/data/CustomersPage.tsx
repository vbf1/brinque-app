import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { createCompanyDataRepository } from './companyDataRepository';

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  cpf: string | null; rg: string | null; zip: string | null; neighborhood: string | null; city_state: string | null;
};

type CustomerForm = Omit<Customer, 'id'>;

const emptyForm: CustomerForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  notes: '', cpf: '', rg: '', zip: '', neighborhood: '', city_state: '',
};

export function CustomersPage({ companyId }: { companyId: string }) {
  const repository = useMemo(
    () => createCompanyDataRepository(supabase, companyId),
    [companyId],
  );
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [message, setMessage] = useState('');

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await repository.fetchCustomers();
      setCustomers(rows as Customer[]);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar os clientes.');
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => { void loadCustomers(); }, [loadCustomers]);

  const visibleCustomers = customers.filter(customer =>
    [customer.name, customer.phone, customer.email]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('pt-BR')
      .includes(search.toLocaleLowerCase('pt-BR')),
  );

  function openForm(customer?: Customer) {
    setFormOpen(true);
    setEditing(customer ?? null);
    setForm(customer ? {
      name: customer.name,
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      address: customer.address ?? '',
      notes: customer.notes ?? '', cpf: customer.cpf ?? '', rg: customer.rg ?? '', zip: customer.zip ?? '',
      neighborhood: customer.neighborhood ?? '', city_state: customer.city_state ?? '',
    } : emptyForm);
    setMessage('');
  }

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) {
      setMessage('Informe o nome do cliente.');
      return;
    }
    setSaving(true);
    try {
      await repository.saveCustomer({ ...form, id: editing?.id });
      setEditing(null);
      setFormOpen(false);
      setForm(emptyForm);
      await loadCustomers();
      setMessage('Cliente salvo com sucesso.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar o cliente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="module-shell">
      <header className="module-header">
        <div>
          <p className="eyebrow">CADASTROS</p>
          <h2>Clientes</h2>
          <p className="module-description">Consulte, cadastre e atualize os clientes da empresa.</p>
        </div>
        <button type="button" onClick={() => openForm()}>Novo cliente</button>
      </header>

      <div className="module-toolbar">
        <input
          aria-label="Buscar clientes"
          placeholder="Buscar por nome, telefone ou e-mail"
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
        <button type="button" className="secondary-button" onClick={() => void loadCustomers()}>Atualizar</button>
      </div>

      {message && <p className="module-feedback" role="status">{message}</p>}

      {formOpen ? (
        <form className="customer-form" onSubmit={saveCustomer}>
          <h3>{editing ? 'Editar cliente' : 'Novo cliente'}</h3>
          <label>Nome *<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <div className="form-grid">
            <label>Telefone<input value={form.phone ?? ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
            <label>E-mail<input type="email" value={form.email ?? ''} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
          </div>
          <label>Endereço<input value={form.address ?? ''} onChange={e => setForm({ ...form, address: e.target.value })} /></label>
          <div className="form-grid">
            <label>CPF<input value={form.cpf ?? ''} onChange={e => setForm({ ...form, cpf: e.target.value })} /></label>
            <label>RG<input value={form.rg ?? ''} onChange={e => setForm({ ...form, rg: e.target.value })} /></label>
            <label>CEP<input value={form.zip ?? ''} onChange={e => setForm({ ...form, zip: e.target.value })} /></label>
            <label>Bairro<input value={form.neighborhood ?? ''} onChange={e => setForm({ ...form, neighborhood: e.target.value })} /></label>
            <label>Cidade/UF<input value={form.city_state ?? ''} onChange={e => setForm({ ...form, city_state: e.target.value })} /></label>
          </div>
          <label>Observações<textarea rows={2} value={form.notes ?? ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={() => { setEditing(null); setFormOpen(false); setForm(emptyForm); }}>Cancelar</button>
            <button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar cliente'}</button>
          </div>
        </form>
      ) : null}

      {loading ? <p className="module-empty">Carregando clientes...</p> : visibleCustomers.length === 0 ? (
        <p className="module-empty">{search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}</p>
      ) : (
        <div className="customer-list">
          {visibleCustomers.map(customer => (
            <article className="customer-row" key={customer.id}>
              <div className="customer-avatar">{customer.name.trim().slice(0, 1).toLocaleUpperCase('pt-BR')}</div>
              <div className="customer-info">
                <strong>{customer.name}</strong>
                <span>{[customer.phone, customer.email].filter(Boolean).join(' · ') || 'Sem telefone ou e-mail'}</span>
              </div>
              <button type="button" className="secondary-button" onClick={() => openForm(customer)}>Editar</button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
