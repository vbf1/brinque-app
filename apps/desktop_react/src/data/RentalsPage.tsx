import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { createCompanyDataRepository } from './companyDataRepository';

type Row = Record<string, any>;
type DraftItem = { productId: string; quantity: number; price: string };

const isoToday = () => new Date().toLocaleDateString('en-CA');
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toLocaleDateString('en-CA');
};
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');

export function RentalsPage({ companyId }: { companyId: string }) {
  const repo = useMemo(() => createCompanyDataRepository(supabase, companyId), [companyId]);
  const [rentals, setRentals] = useState<Row[]>([]);
  const [customers, setCustomers] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [startDate, setStartDate] = useState(isoToday());
  const [endDate, setEndDate] = useState(addDays(isoToday(), 1));
  const [status, setStatus] = useState('pending');
  const [deliveryMethod, setDeliveryMethod] = useState('customer_pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ productId: '', quantity: 1, price: '0' }]);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c, p] = await Promise.all([repo.fetchRentals(), repo.fetchCustomers(), repo.fetchProducts()]);
      setRentals(r as Row[]); setCustomers(c as Row[]); setProducts(p as Row[]); setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar as locações.');
    } finally { setLoading(false); }
  }, [repo]);
  useEffect(() => { void load(); }, [load]);

  const days = Math.max(0, Math.round((new Date(`${endDate}T12:00:00`).getTime() - new Date(`${startDate}T12:00:00`).getTime()) / 86400000) + 1);
  const total = items.reduce((sum, item) => sum + Math.max(0, item.quantity) * Math.max(0, Number(item.price.replace(',', '.'))) * days, 0);

  function openForm(rental?: Row) {
    setEditing(rental ?? null);
    setCustomerId(rental?.customer_id ?? '');
    setStartDate(rental?.start_date ?? isoToday());
    setEndDate(rental?.end_date ?? addDays(isoToday(), 1));
    setStatus(rental?.status ?? 'pending');
    setDeliveryMethod(rental?.delivery_method ?? 'customer_pickup');
    setDeliveryAddress(rental?.delivery_address ?? '');
    const oldItems = (rental?.rental_items ?? []).map((item: Row) => ({
      productId: item.product_id, quantity: Number(item.quantity),
      price: String(item.unit_price ?? 0),
    }));
    setItems(oldItems.length ? oldItems : [{ productId: '', quantity: 1, price: '0' }]);
    setFormOpen(true); setMessage('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customerId || !startDate || !endDate || endDate < startDate) {
      setMessage('Confira o cliente e o período da locação.'); return;
    }
    if (deliveryMethod === 'delivery' && !deliveryAddress.trim()) {
      setMessage('Informe o endereço de entrega.'); return;
    }
    if (!items.length || items.some(item => !item.productId || !Number.isInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(Number(item.price.replace(',', '.'))) || Number(item.price.replace(',', '.')) < 0)) {
      setMessage('Confira os brinquedos, quantidades e preços.'); return;
    }
    if (new Set(items.map(item => item.productId)).size !== items.length) {
      setMessage('Não selecione o mesmo brinquedo mais de uma vez.'); return;
    }
    setSaving(true);
    try {
      const payload = {
        customerId, startDate, endDate, status: status as 'pending' | 'confirmed' | 'ongoing' | 'completed' | 'cancelled',
        deliveryMethod: deliveryMethod as 'delivery' | 'customer_pickup',
        totalAmount: total,
        items: items.map(item => ({ product_id: item.productId, quantity: item.quantity, unit_price: Number(item.price.replace(',', '.')) })),
        deliveryAddress: deliveryMethod === 'delivery' ? deliveryAddress.trim() : null,
        responsibleUserIds: (editing?.rental_responsibles ?? []).map((r: Row) => r.user_id).filter(Boolean),
      };
      if (editing) await repo.updateRentalWithItems({ rentalId: editing.id, ...payload });
      else await repo.createRentalWithItems({ ...payload, status: status as 'pending' | 'confirmed' | 'ongoing', responsibleUserIds: [] });
      setFormOpen(false); await load(); setMessage('Locação salva com sucesso.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar a locação.');
    } finally { setSaving(false); }
  }

  const visible = rentals.filter(rental => String(rental.customers?.name ?? '').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));

  return <section className="module-shell">
    <header className="module-header"><div><p className="eyebrow">OPERAÇÃO</p><h2>Locações</h2><p className="module-description">Crie e edite locações com vários brinquedos no mesmo pedido.</p></div><button type="button" onClick={() => openForm()}>Nova locação</button></header>
    <div className="module-toolbar"><input aria-label="Buscar locações" placeholder="Buscar por cliente" value={search} onChange={e => setSearch(e.target.value)} /><button type="button" className="secondary-button" onClick={() => void load()}>Atualizar</button></div>
    {message && <p className="module-feedback" role="status">{message}</p>}
    {formOpen && <form className="customer-form rental-form" onSubmit={save}>
      <h3>{editing ? 'Editar locação' : 'Nova locação'}</h3>
      <label>Cliente *<select required value={customerId} onChange={e => setCustomerId(e.target.value)}><option value="">Selecione o cliente</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="form-grid">
        <label>Data de início *<input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
        <label>Data de término *<input type="date" min={startDate} required value={endDate} onChange={e => setEndDate(e.target.value)} /></label>
        <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="pending">Pendente</option><option value="confirmed">Confirmada</option><option value="ongoing">Em andamento</option>{editing && <><option value="completed">Concluída</option><option value="cancelled">Cancelada</option></>}</select></label>
        <label>Entrega<select value={deliveryMethod} onChange={e => setDeliveryMethod(e.target.value)}><option value="customer_pickup">Retirada pelo cliente</option><option value="delivery">Entregar no endereço</option></select></label>
      </div>
      {deliveryMethod === 'delivery' && <label>Endereço de entrega *<input required value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} /></label>}
      <div className="rental-items-heading"><h3>Brinquedos da locação</h3><button type="button" className="secondary-button" onClick={() => setItems([...items, { productId: '', quantity: 1, price: '0' }])}>+ Adicionar brinquedo</button></div>
      {items.map((item, index) => <div className="rental-item-editor" key={index}>
        <div className="rental-item-top"><strong>Brinquedo {index + 1}</strong><button type="button" className="remove-item-button" disabled={items.length === 1} onClick={() => setItems(items.filter((_, i) => i !== index))}>Remover</button></div>
        <label>Brinquedo<select required value={item.productId} onChange={e => {
          const product = products.find(p => p.id === e.target.value);
          setItems(items.map((current, i) => i === index ? { ...current, productId: e.target.value, price: String(product?.daily_price ?? current.price) } : current));
        }}><option value="">Selecione</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <div className="form-grid"><label>Quantidade<input type="number" min="1" step="1" required value={item.quantity} onChange={e => setItems(items.map((current, i) => i === index ? { ...current, quantity: Number(e.target.value) } : current))} /></label><label>Diária por unidade (R$)<input inputMode="decimal" required value={item.price} onChange={e => setItems(items.map((current, i) => i === index ? { ...current, price: e.target.value } : current))} /></label></div>
      </div>)}
      <div className="rental-total"><span>{days} diária(s) · Total estimado</span><strong>{money(total)}</strong></div>
      {editing && <p className="module-description">Os responsáveis já vinculados serão preservados nesta edição.</p>}
      <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar locação'}</button></div>
    </form>}
    {loading ? <p className="module-empty">Carregando locações...</p> : visible.length === 0 ? <p className="module-empty">Nenhuma locação encontrada.</p> : <div className="customer-list">{visible.map(rental => <article className="customer-row rental-row" key={rental.id}>
      <div className="customer-avatar">📅</div><div className="customer-info"><strong>{rental.customers?.name ?? 'Cliente'}</strong><span>{dateLabel(rental.start_date)} a {dateLabel(rental.end_date)} · {(rental.rental_items ?? []).map((item: Row) => item.products?.name ?? 'Brinquedo').join(', ')} · {money(Number(rental.total_amount ?? 0))} · {rental.status}</span></div><button type="button" className="secondary-button" onClick={() => openForm(rental)}>Editar</button>
    </article>)}</div>}
  </section>;
}
