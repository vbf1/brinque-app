import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createCompanyDataRepository } from './companyDataRepository';
import { supabase } from '../lib/supabase';

type Transaction = { id: string; transaction_type: 'income' | 'expense'; description: string; amount: number; paid_at?: string | null; created_at: string };
type RentalOption = { id: string; rental_number: number; total_amount: number; customers?: { name?: string } | null };
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char] ?? char));

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function FinancePage({ companyId }: { companyId: string }) {
  const repository = useMemo(() => createCompanyDataRepository(supabase, companyId), [companyId]);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState('');
  const [rentals, setRentals] = useState<RentalOption[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentRentalId, setPaymentRentalId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [paymentNotes, setPaymentNotes] = useState('');

  async function reload() {
    setLoading(true);
    try {
      const [transactions, rentalRows] = await Promise.all([repository.fetchTransactions(), repository.fetchRentals()]);
      setRows(transactions as Transaction[]);
      setRentals(rentalRows.filter((r: any) => r.status !== 'cancelled') as RentalOption[]);
      setMessage('');
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o financeiro.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, [repository]);

  const income = rows.filter(row => row.transaction_type === 'income').reduce((sum, row) => sum + Number(row.amount), 0);
  const expense = rows.filter(row => row.transaction_type === 'expense').reduce((sum, row) => sum + Number(row.amount), 0);
  const filtered = rows.filter(row => row.description.toLowerCase().includes(search.toLowerCase()));

  function openForm(row?: Transaction) {
    setFormOpen(true); setEditing(row ?? null); setDescription(row?.description ?? '');
    setType(row?.transaction_type ?? 'income'); setAmount(row ? String(row.amount) : '');
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      await repository.saveTransaction({ id: editing?.id, description, type, amount: Number(amount.replace(',', '.')) });
      setFormOpen(false); setEditing(null); setDescription(''); setAmount(''); await reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  async function registerPayment(event: FormEvent) {
    event.preventDefault();
    const value = Number(paymentAmount.replace(',', '.'));
    if (!paymentRentalId || !Number.isFinite(value) || value <= 0) { setMessage('Selecione a locação e informe o valor recebido.'); return; }
    const printWindow = window.open('', '_blank');
    setBusy(true); setMessage('');
    try {
      const { data: paymentId, error } = await supabase.rpc('register_rental_payment', {
        p_company_id: companyId, p_rental_id: paymentRentalId, p_amount: value,
        p_payment_method: paymentMethod, p_notes: paymentNotes.trim() || null,
      });
      if (error) throw error;
      const { data: payment, error: paymentError } = await supabase.from('payments')
        .select('id,amount,payment_method,paid_at,notes,rentals(rental_number,customers(name))')
        .eq('id', paymentId).eq('company_id', companyId).single();
      if (paymentError) throw paymentError;
      const rental = (payment as any).rentals;
      const methodLabels: Record<string,string> = { pix:'Pix',cash:'Dinheiro',card:'Cartão',bank_transfer:'Transferência bancária',other:'Outro' };
      if (printWindow) {
        printWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recibo de pagamento</title><style>body{font-family:Arial,sans-serif;color:#182235;margin:0;padding:36px;background:#f3f5f8}.receipt{max-width:680px;margin:20px auto;padding:38px;background:white;border:1px solid #e2e7ef;border-radius:14px}.brand{font-size:12px;font-weight:bold;letter-spacing:2px;color:#4b6386}.receipt h1{font-size:25px;margin:20px 0 6px}.muted{color:#68758a;font-size:13px}.amount{font-size:30px;font-weight:bold;margin:28px 0;padding:18px;background:#f3f7ff;border-radius:10px}.line{display:flex;justify-content:space-between;gap:20px;padding:13px 0;border-bottom:1px solid #e9edf3;font-size:14px}.line span{color:#68758a}.notes{margin-top:22px;font-size:13px}.actions{margin-top:28px;text-align:right}.actions button{padding:12px 20px;border:0;border-radius:8px;background:#2868d2;color:white;font-weight:bold}@media print{body{background:white;padding:0}.receipt{margin:0 auto;border:0;border-radius:0}.actions{display:none}}</style></head><body><main class="receipt"><div class="brand">KIDSLOC APP</div><h1>Recibo de pagamento</h1><p class="muted">Comprovante de recebimento</p><div class="amount">${money(Number(payment.amount))}</div><div class="line"><span>Recibo</span><strong>${escapeHtml(String(payment.id).slice(0,8).toUpperCase())}</strong></div><div class="line"><span>Locação</span><strong>#${escapeHtml(rental?.rental_number ?? '')}</strong></div><div class="line"><span>Cliente</span><strong>${escapeHtml(rental?.customers?.name ?? 'Não informado')}</strong></div><div class="line"><span>Data</span><strong>${new Date(payment.paid_at).toLocaleDateString('pt-BR')}</strong></div><div class="line"><span>Forma de pagamento</span><strong>${escapeHtml(methodLabels[payment.payment_method] ?? payment.payment_method)}</strong></div><p class="notes">${escapeHtml(payment.notes || 'Pagamento recebido e registrado no KidsLoc.')}</p><div class="actions"><button onclick="window.print()">Imprimir / Salvar em PDF</button></div></main></body></html>`);
        printWindow.document.close();
      }
      setPaymentOpen(false); setPaymentAmount(''); setPaymentNotes(''); await reload();
      setMessage(printWindow ? 'Pagamento registrado e recibo emitido. Use Imprimir / Salvar em PDF na nova aba.' : 'Pagamento registrado e recibo salvo. O navegador bloqueou a janela do recibo; permita pop-ups para imprimi-lo.');
    } catch (error) {
      printWindow?.close();
      setMessage(error instanceof Error ? error.message : 'Não foi possível registrar o pagamento.');
    } finally { setBusy(false); }
  }

  async function remove(row: Transaction) {
    if (!window.confirm('Excluir este lançamento financeiro?')) return;
    setBusy(true);
    try { await repository.deleteTransaction(row.id); await reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível excluir.'); }
    finally { setBusy(false); }
  }

  return <section className="data-page">
    <div className="data-page-heading"><div><p className="eyebrow">GESTÃO FINANCEIRA</p><h1>Financeiro</h1><p>Entradas, saídas e movimentações registradas.</p></div><div className="finance-heading-actions"><button type="button" className="secondary-button" onClick={() => setPaymentOpen(value => !value)}>Registrar recebimento</button><button type="button" onClick={() => openForm()}>Novo lançamento</button></div></div>
    <div className="data-summary-grid"><article className="data-summary"><span>Entradas</span><strong>{money(income)}</strong></article><article className="data-summary"><span>Saídas</span><strong>{money(expense)}</strong></article><article className="data-summary"><span>Saldo registrado</span><strong>{money(income-expense)}</strong></article></div>
    {paymentOpen && <form className="data-form" onSubmit={registerPayment}>
      <h2>Registrar recebimento e emitir recibo</h2>
      <label>Locação<select required value={paymentRentalId} onChange={event => setPaymentRentalId(event.target.value)}><option value="">Selecione a locação</option>{rentals.map(r => <option key={r.id} value={r.id}>#{r.rental_number} · {r.customers?.name || 'Cliente'} · {money(Number(r.total_amount))}</option>)}</select></label>
      <label>Valor recebido (R$)<input required inputMode="decimal" value={paymentAmount} onChange={event => setPaymentAmount(event.target.value)} placeholder="0,00" /></label>
      <label>Forma de pagamento<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)}><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card">Cartão</option><option value="bank_transfer">Transferência bancária</option><option value="other">Outro</option></select></label>
      <label>Observações<input value={paymentNotes} onChange={event => setPaymentNotes(event.target.value)} maxLength={300} /></label>
      <div className="data-form-actions"><button disabled={busy} type="submit">{busy ? 'Registrando...' : 'Confirmar pagamento e gerar recibo'}</button><button className="secondary-button" type="button" onClick={() => setPaymentOpen(false)}>Cancelar</button></div>
      <small>O recebimento será lançado no financeiro, vinculado à locação, e um documento de recibo será registrado.</small>
    </form>}
    {formOpen ? <form className="data-form" onSubmit={save}>
      <h2>{editing ? 'Editar lançamento' : 'Novo lançamento'}</h2>
      <label>Descrição<input value={description} onChange={event => setDescription(event.target.value)} required maxLength={160} placeholder="Ex.: Combustível" /></label>
      <label>Tipo<select value={type} onChange={event => setType(event.target.value as 'income' | 'expense')}><option value="income">Entrada</option><option value="expense">Saída</option></select></label>
      <label>Valor (R$)<input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" required placeholder="0,00" /></label>
      <div className="data-form-actions"><button disabled={busy} type="submit">{busy ? 'Salvando...' : 'Salvar'}</button><button className="secondary-button" type="button" onClick={() => { setFormOpen(false); setEditing(null); setDescription(''); setAmount(''); }}>Cancelar</button></div>
    </form> : null}
    <div className="data-toolbar"><input aria-label="Pesquisar lançamento" value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar movimentação..." /></div>
    {message && <p className="feedback error" role="alert">{message}</p>}
    {loading ? <p>Carregando movimentações...</p> : filtered.length === 0 ? <p>Nenhuma movimentação encontrada.</p> : <div className="data-list">{filtered.map(row => <article className="data-list-row" key={row.id}>
      <div><strong>{row.description}</strong><span>{row.transaction_type === 'income' ? 'Entrada' : 'Saída'} · {row.paid_at ? new Date(row.paid_at + 'T12:00:00').toLocaleDateString('pt-BR') : new Date(row.created_at).toLocaleDateString('pt-BR')}</span></div>
      <strong>{money(Number(row.amount))}</strong><div className="data-row-actions"><button type="button" className="secondary-button" onClick={() => openForm(row)}>Editar</button><button type="button" className="danger-button" disabled={busy} onClick={() => void remove(row)}>Excluir</button></div>
    </article>)}</div>}
  </section>;
}
