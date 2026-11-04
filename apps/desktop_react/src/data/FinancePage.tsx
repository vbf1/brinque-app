import { useEffect, useMemo, useState } from 'react';
import { createCompanyDataRepository } from './companyDataRepository';
import { supabase } from '../lib/supabase';

type Transaction = { id: string; transaction_type: 'income' | 'expense'; description: string; amount: number; paid_at?: string | null; created_at: string };

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function FinancePage({ companyId }: { companyId: string }) {
  const repository = useMemo(() => createCompanyDataRepository(supabase, companyId), [companyId]);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState('');

  async function reload() {
    setLoading(true);
    try { setRows(await repository.fetchTransactions() as Transaction[]); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o financeiro.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, [repository]);

  const income = rows.filter(row => row.transaction_type === 'income').reduce((sum, row) => sum + Number(row.amount), 0);
  const expense = rows.filter(row => row.transaction_type === 'expense').reduce((sum, row) => sum + Number(row.amount), 0);
  const filtered = rows.filter(row => row.description.toLowerCase().includes(search.toLowerCase()));

  function openForm(row?: Transaction) {
    setEditing(row ?? null); setDescription(row?.description ?? '');
    setType(row?.transaction_type ?? 'income'); setAmount(row ? String(row.amount) : '');
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      await repository.saveTransaction({ id: editing?.id, description, type, amount: Number(amount.replace(',', '.')) });
      openForm(); await reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  async function remove(row: Transaction) {
    if (!window.confirm('Excluir este lançamento financeiro?')) return;
    setBusy(true);
    try { await repository.deleteTransaction(row.id); await reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível excluir.'); }
    finally { setBusy(false); }
  }

  return <section className="data-page">
    <div className="data-page-heading"><div><p className="eyebrow">GESTÃO FINANCEIRA</p><h1>Financeiro</h1><p>Entradas, saídas e movimentações registradas.</p></div><button type="button" onClick={() => openForm()}>Novo lançamento</button></div>
    <div className="data-summary-grid"><article className="data-summary"><span>Entradas</span><strong>{money(income)}</strong></article><article className="data-summary"><span>Saídas</span><strong>{money(expense)}</strong></article><article className="data-summary"><span>Saldo registrado</span><strong>{money(income-expense)}</strong></article></div>
    {editing !== null || description || amount ? <form className="data-form" onSubmit={save}>
      <h2>{editing ? 'Editar lançamento' : 'Novo lançamento'}</h2>
      <label>Descrição<input value={description} onChange={event => setDescription(event.target.value)} required maxLength={160} placeholder="Ex.: Combustível" /></label>
      <label>Tipo<select value={type} onChange={event => setType(event.target.value as 'income' | 'expense')}><option value="income">Entrada</option><option value="expense">Saída</option></select></label>
      <label>Valor (R$)<input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" required placeholder="0,00" /></label>
      <div className="data-form-actions"><button disabled={busy} type="submit">{busy ? 'Salvando...' : 'Salvar'}</button><button className="secondary-button" type="button" onClick={() => { setEditing(null); setDescription(''); setAmount(''); }}>Cancelar</button></div>
    </form> : null}
    <div className="data-toolbar"><input aria-label="Pesquisar lançamento" value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar movimentação..." /></div>
    {message && <p className="feedback error" role="alert">{message}</p>}
    {loading ? <p>Carregando movimentações...</p> : filtered.length === 0 ? <p>Nenhuma movimentação encontrada.</p> : <div className="data-list">{filtered.map(row => <article className="data-list-row" key={row.id}>
      <div><strong>{row.description}</strong><span>{row.transaction_type === 'income' ? 'Entrada' : 'Saída'} · {row.paid_at ? new Date(row.paid_at + 'T12:00:00').toLocaleDateString('pt-BR') : new Date(row.created_at).toLocaleDateString('pt-BR')}</span></div>
      <strong>{money(Number(row.amount))}</strong><div className="data-row-actions"><button type="button" className="secondary-button" onClick={() => openForm(row)}>Editar</button><button type="button" className="danger-button" disabled={busy} onClick={() => void remove(row)}>Excluir</button></div>
    </article>)}</div>}
  </section>;
}
