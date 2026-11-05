import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { createCompanyDataRepository } from './companyDataRepository';
import { AppSelect } from '../components/AppSelect';

type Product = {
  id: string;
  name: string;
  inventory_mode: 'quantity' | 'individual';
  total_quantity: number;
  daily_price: number;
  available: number;
  units?: Array<{ id: string; asset_code: string | null; status: string }>;
};

export function ProductsPage({ companyId }: { companyId: string }) {
  const repository = useMemo(() => createCompanyDataRepository(supabase, companyId), [companyId]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rentals, setRentals] = useState<any[]>([]);
  const [updatingUnit, setUpdatingUnit] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'quantity' | 'individual'>('quantity');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('0');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, units, rentalRows] = await Promise.all([repository.fetchProducts(), repository.fetchProductUnits(), repository.fetchRentals()]);
      setRentals(rentalRows);
      setProducts(rows.map(row => {
        const productUnits = units.filter(unit => unit.product_id === row.id);
        return { ...row, units: productUnits, available: row.inventory_mode === 'individual'
          ? productUnits.filter(unit => unit.status === 'available').length
          : row.total_quantity } as Product;
      }));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o estoque.');
    } finally { setLoading(false); }
  }, [repository]);

  useEffect(() => { void load(); }, [load]);

  function openForm(product?: Product) {
    setEditing(product ?? null);
    setName(product?.name ?? '');
    setMode(product?.inventory_mode ?? 'quantity');
    setQuantity(String(product?.total_quantity ?? 1));
    setPrice(String(product?.daily_price ?? 0));
    setFormOpen(true);
    setMessage('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const qty = Number(quantity);
    const dailyPrice = Number(price.replace(',', '.'));
    if (!name.trim() || !Number.isInteger(qty) || qty < 1 || !Number.isFinite(dailyPrice) || dailyPrice < 0) {
      setMessage('Confira o nome, a quantidade e o preço diário.');
      return;
    }
    setSaving(true);
    try {
      await repository.saveProduct({ id: editing?.id, name, inventoryMode: mode, quantity: qty, dailyPrice });
      setFormOpen(false);
      await load();
      setMessage('Brinquedo salvo com sucesso.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar o brinquedo.');
    } finally { setSaving(false); }
  }

  const visible = products.filter(product => product.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));

  return <section className="module-shell">
    <header className="module-header">
      <div><p className="eyebrow">CADASTROS</p><h2>Brinquedos e estoque</h2><p className="module-description">Controle de quantidades, unidades individuais e preço das diárias.</p></div>
      <button type="button" onClick={() => openForm()}>Novo brinquedo</button>
    </header>
    <div className="module-toolbar">
      <input aria-label="Buscar brinquedos" placeholder="Buscar brinquedo" value={search} onChange={e => setSearch(e.target.value)} />
      <button type="button" className="secondary-button" onClick={() => void load()}>Atualizar</button>
    </div>
    {message && <p className="module-feedback" role="status">{message}</p>}
    {formOpen && <form className="customer-form" onSubmit={save}>
      <h3>{editing ? 'Editar brinquedo' : 'Cadastrar brinquedo'}</h3>
      <label>Nome do brinquedo *<input required value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Tipo de controle<AppSelect value={mode} disabled={!!editing} onChange={value => setMode(value as typeof mode)} options={[{ value: 'quantity', label: 'Por quantidade' }, { value: 'individual', label: 'Unidades individuais' }]} /></label>
      {editing && <p className="module-description">O tipo de controle não pode ser alterado após o cadastro.</p>}
      <div className="form-grid">
        <label>Quantidade total<input type="number" min="1" step="1" required value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
        <label>Preço da diária (R$)<input inputMode="decimal" required value={price} onChange={e => setPrice(e.target.value)} /></label>
      </div>
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Cancelar</button>
        <button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar brinquedo'}</button>
      </div>
    </form>}
    {loading ? <p className="module-empty">Carregando estoque...</p> : visible.length === 0 ? <p className="module-empty">{search ? 'Nenhum brinquedo encontrado.' : 'Nenhum brinquedo cadastrado.'}</p> : (
      <div className="customer-list">{visible.map(product => <article className="customer-row" key={product.id}>
        <div className="customer-avatar">🎈</div>
        <div className="customer-info"><strong>{product.name}</strong><span>{product.available} disponível(is) de {product.total_quantity} · R$ {Number(product.daily_price).toFixed(2)} / dia · {product.inventory_mode === 'individual' ? 'Unidades individuais' : 'Por quantidade'}</span></div>
        <button type="button" className="secondary-button" onClick={() => openForm(product)}>Editar</button>
        {product.inventory_mode === 'individual' && product.units?.length ? <div className="record-card-units">{product.units.map(unit => {
          const history = rentals.filter(r => (r.rental_items ?? []).some((item: any) => (item.rental_item_units ?? []).some((allocation: any) => allocation.product_unit_id === unit.id))).sort((a, b) => String(b.start_date).localeCompare(String(a.start_date))).slice(0, 3);
          const today = new Date().toISOString().slice(0, 10);
          const reserved = rentals.some(r => ['pending','confirmed','ongoing'].includes(r.status) && r.start_date <= today && (r.end_date || r.start_date) >= today && (r.rental_items ?? []).some((item: any) => (item.rental_item_units ?? []).some((allocation: any) => allocation.product_unit_id === unit.id)));
          return <div className="record-unit-row" key={unit.id}>
            <span><strong>Unidade {unit.asset_code || '—'}</strong><small>{unit.status === 'maintenance' ? 'Em manutenção' : unit.status === 'inactive' ? 'Inativa' : reserved ? 'Reservada hoje' : 'Disponível'}</small></span>
            <button type="button" className="secondary-button" disabled={updatingUnit === unit.id || (unit.status !== 'maintenance' && unit.status !== 'available')} onClick={async () => {
              setUpdatingUnit(unit.id);
              try { await repository.setProductUnitStatus(unit.id, unit.status === 'maintenance' ? 'available' : 'maintenance'); await load(); }
              catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar a unidade.'); }
              finally { setUpdatingUnit(null); }
            }}>{updatingUnit === unit.id ? 'Salvando…' : unit.status === 'maintenance' ? 'Liberar' : 'Manutenção'}</button>
            <small className="record-unit-history">Histórico: {history.length ? history.map((r: any) => [r.customers?.name || 'Cliente', r.start_date, r.status].join(' · ')).join(' | ') : 'Sem locações registradas'}</small>
          </div>;
        })}</div> : null}
      </article>)}</div>
    )}
  </section>;
}
