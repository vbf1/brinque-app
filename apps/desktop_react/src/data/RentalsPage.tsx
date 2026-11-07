import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { createCompanyDataRepository } from './companyDataRepository';
import { CustomerPicker } from '../components/CustomerPicker';

type Row = Record<string, any>;
type CustomerOption = { id: string; name: string };
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
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canManageRentals, setCanManageRentals] = useState(false);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [startDate, setStartDate] = useState(isoToday());
  const [endDate, setEndDate] = useState(addDays(isoToday(), 1));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [status, setStatus] = useState('pending');
  const [deliveryMethod, setDeliveryMethod] = useState('customer_pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [responsibleIds, setResponsibleIds] = useState<string[]>([]);
  const [items, setItems] = useState<DraftItem[]>([{ productId: '', quantity: 1, price: '0' }]);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      repo.fetchRentals(),
      repo.fetchCustomers(),
      repo.fetchProducts(),
      repo.fetchCompanyMembers(),
    ]);
    const [rentalsResult, customersResult, productsResult, employeesResult] = results;
    const errors: string[] = [];
    if (rentalsResult.status === 'fulfilled') setRentals(rentalsResult.value as Row[]);
    else errors.push('locações: ' + (rentalsResult.reason instanceof Error ? rentalsResult.reason.message : 'falha ao carregar'));
    if (customersResult.status === 'fulfilled') setCustomers(customersResult.value as CustomerOption[]);
    else errors.push('clientes: ' + (customersResult.reason instanceof Error ? customersResult.reason.message : 'falha ao carregar'));
    if (productsResult.status === 'fulfilled') setProducts(productsResult.value as Row[]);
    else errors.push('brinquedos: ' + (productsResult.reason instanceof Error ? productsResult.reason.message : 'falha ao carregar'));
    if (employeesResult.status === 'fulfilled') {
      const members = employeesResult.value as Row[];
      setEmployees(members);
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const currentMember = members.find(employee => employee.user_id === auth.user?.id);
        setCanManageRentals(['owner', 'admin'].includes(currentMember?.role));
      } catch (error) {
        // Fail closed: a temporary auth lookup failure must not grant management rights.
        setCanManageRentals(false);
        errors.push('permissões: ' + (error instanceof Error ? error.message : 'não foi possível confirmar a sessão'));
      }
    } else {
      errors.push('equipe: ' + (employeesResult.reason instanceof Error ? employeesResult.reason.message : 'falha ao carregar'));
    }
    setMessage(errors.length ? 'Alguns dados não puderam ser carregados — ' + errors.join('; ') : '');
    setLoading(false);
  }, [repo]);
  useEffect(() => { void load(); }, [load]);

  const days = Math.max(0, Math.round((new Date(`${endDate}T12:00:00`).getTime() - new Date(`${startDate}T12:00:00`).getTime()) / 86400000) + 1);

  async function openForm(rental?: Row) {
    // Limpa mensagens antigas antes de buscar os clientes novamente.
    setMessage('');
    let customerLoadMessage = '';
    try {
      // Busca diretamente na empresa ativa ao abrir o formulário, sem depender do cache da tela.
      const latestCustomers = await repo.fetchCustomers();
      setCustomers(latestCustomers as CustomerOption[]);
      if (!latestCustomers.length) {
        customerLoadMessage = 'Nenhum cliente cadastrado nesta empresa. Confira se a empresa selecionada é a correta ou cadastre um cliente na seção Clientes.';
      }
    } catch (error) {
      customerLoadMessage = 'Não foi possível carregar os clientes: ' + (error instanceof Error ? error.message : 'erro desconhecido');
    }
    setEditing(rental ?? null);
    setCustomerId(rental?.customer_id ?? '');
    setStartDate(rental?.start_date ?? isoToday());
    setEndDate(rental?.end_date ?? addDays(isoToday(), 1));
    setStartTime(rental?.start_time ? String(rental.start_time).slice(0,5) : rental ? '00:00' : '09:00');
    setEndTime(rental?.end_time ? String(rental.end_time).slice(0,5) : rental ? '23:59' : '17:00');
    setStatus(rental?.status ?? 'pending');
    setDeliveryMethod(rental?.delivery_method ?? 'customer_pickup');
    setDeliveryAddress(rental?.delivery_address ?? '');
    setTotalAmount(rental ? String(rental.total_amount ?? 0) : '');
    const assigned = (rental?.rental_responsibles ?? []).map((row: Row) => row.user_id).filter(Boolean) as string[];
    setResponsibleIds(assigned);
    if (!rental) void supabase.auth.getUser().then(({ data, error }) => {
      if (!error && data.user && employees.some(employee => employee.user_id === data.user?.id)) setResponsibleIds([data.user.id]);
    }).catch(() => {
      // Selecting the current employee is optional; the form remains usable if auth is offline.
    });
    const oldItems = (rental?.rental_items ?? []).map((item: Row) => ({
      productId: item.product_id, quantity: Number(item.quantity),
      price: String(item.unit_price ?? 0),
    }));
    setItems(oldItems.length ? oldItems : [{ productId: '', quantity: 1, price: '0' }]);
    setFormOpen(true);
    // Mantém visível a causa quando a consulta falha ou a empresa não possui clientes.
    if (customerLoadMessage) setMessage(customerLoadMessage);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customerId || !startDate || !endDate || endDate < startDate || !startTime || !endTime || (startDate === endDate && endTime <= startTime)) {
      setMessage('Confira o cliente, as datas e os horários da locação.'); return;
    }
    if (deliveryMethod === 'delivery' && !deliveryAddress.trim()) {
      setMessage('Informe o endereço de entrega.'); return;
    }
    if (!Number.isFinite(Number(totalAmount.replace(',', '.'))) || Number(totalAmount.replace(',', '.')) < 0) {
      setMessage('Informe um valor total válido.'); return;
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
        customerId, startDate, endDate, startTime, endTime, status: status as 'pending' | 'confirmed' | 'ongoing' | 'completed' | 'cancelled',
        deliveryMethod: deliveryMethod as 'delivery' | 'customer_pickup',
        totalAmount: Number(totalAmount.replace(',', '.')),
        items: items.map(item => ({ product_id: item.productId, quantity: item.quantity, unit_price: Number(item.price.replace(',', '.')) })),
        deliveryAddress: deliveryMethod === 'delivery' ? deliveryAddress.trim() : null,
        responsibleUserIds: responsibleIds,
      };
      if (editing) await repo.updateRentalWithItems({ rentalId: editing.id, ...payload });
      else await repo.createRentalWithItems({ ...payload, status: status as 'pending' | 'confirmed' | 'ongoing' });
      setFormOpen(false); await load(); setMessage('Locação salva com sucesso.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar a locação.');
    } finally { setSaving(false); }
  }


  async function deleteRental(rental: Row) {
    setSaving(true);
    try {
      const { data: existingContract, error: contractError } = await supabase
        .from('rental_contracts').select('id,status').eq('rental_id', rental.id).in('status', ['sent','viewed','signed']).limit(1).maybeSingle();
      if (contractError) throw contractError;
      if (existingContract) {
        setMessage('Esta locação possui um contrato enviado ou assinado. A exclusão foi bloqueada para preservar o histórico e os documentos.');
        return;
      }
      const confirmed = window.confirm('Excluir esta locação? Os itens e eventos vinculados serão removidos. Lançamentos financeiros e pagamentos relacionados serão preservados quando houver vínculo configurado. Esta ação não poderá ser desfeita.');
      if (!confirmed) return;
      await repo.deleteRental(rental.id);
      await load();
      setMessage('Locação excluída.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível excluir a locação.');
    } finally { setSaving(false); }
  }

  const visible = rentals.filter(rental => String(rental.customers?.name ?? '').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));

  return <section className="module-shell">
    <header className="module-header"><div><p className="eyebrow">OPERAÇÃO</p><h2>Locações</h2><p className="module-description">Crie e edite locações com vários brinquedos no mesmo pedido.</p></div><button type="button" onClick={() => openForm()}>Nova locação</button></header>
    <div className="module-toolbar"><input aria-label="Buscar locações" placeholder="Buscar por cliente" value={search} onChange={e => setSearch(e.target.value)} /><button type="button" className="secondary-button" onClick={() => void load()}>Atualizar</button></div>
    {message && <p className="module-feedback" role="status">{message}</p>}
    {!canManageRentals && <p className="module-description">Nesta versão, a edição de locações fica restrita ao proprietário e aos administradores para preservar todos os funcionários responsáveis vinculados.</p>}
    {formOpen && <form className="customer-form rental-form" onSubmit={save}>
      <h3>{editing ? 'Editar locação' : 'Nova locação'}</h3>
      <label>Cliente *<CustomerPicker customers={customers} value={customerId} onChange={setCustomerId} />{customers.length === 0 && <small className="module-description">A lista é atualizada diretamente do cadastro da empresa ao abrir esta tela. Confira também a mensagem de carregamento acima.</small>}</label>
      <div className="form-grid">
        <label>Data de início *<input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
        <label>Horário de início *<input type="time" required value={startTime} onChange={e => setStartTime(e.target.value)} /></label>
        <label>Data de término *<input type="date" min={startDate} required value={endDate} onChange={e => setEndDate(e.target.value)} /></label>
        <label>Horário de término *<input type="time" required value={endTime} onChange={e => setEndTime(e.target.value)} /></label>
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
      <label>Valor total da locação (R$) *<input type="number" min="0" step="0.01" required value={totalAmount} onChange={e => setTotalAmount(e.target.value)} placeholder="0,00" /></label>
      <p className="module-description">Período: {days} diária(s). O valor total é informado manualmente, como no sistema atual.</p>
      <div className="rental-responsibles"><h3>Funcionários responsáveis</h3>{employees.length ? employees.map(employee => <label className="rental-responsible-option" key={employee.user_id}><input type="checkbox" checked={responsibleIds.includes(employee.user_id)} onChange={event => setResponsibleIds(current => event.target.checked ? [...current, employee.user_id] : current.filter(id => id !== employee.user_id))} /><span><strong>{employee.name}</strong><small>{employee.role}</small></span></label>) : <p className="module-description">Nenhum funcionário disponível para seleção.</p>}</div>
      <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar locação'}</button></div>
    </form>}
    {loading ? <p className="module-empty">Carregando locações...</p> : visible.length === 0 ? <p className="module-empty">Nenhuma locação encontrada.</p> : <div className="customer-list">{visible.map(rental => <article className="customer-row rental-row" key={rental.id}>
      <div className="customer-avatar">📅</div><div className="customer-info"><strong>{rental.customers?.name ?? 'Cliente'}</strong><span>{dateLabel(rental.start_date)} a {dateLabel(rental.end_date)} · {(rental.rental_items ?? []).map((item: Row) => item.products?.name ?? 'Brinquedo').join(', ')} · {money(Number(rental.total_amount ?? 0))} · {rental.status}</span></div><div className="rental-row-actions"><button type="button" className="secondary-button" disabled={!canManageRentals || saving} title={!canManageRentals ? 'Edição restrita ao proprietário e administradores' : 'Editar locação'} onClick={() => openForm(rental)}>Editar</button><button type="button" className="remove-item-button" disabled={!canManageRentals || saving} title={!canManageRentals ? 'Exclusão restrita ao proprietário e administradores' : 'Excluir locação'} onClick={() => void deleteRental(rental)}>Excluir</button></div>
    </article>)}</div>}
  </section>;
}
