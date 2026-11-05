import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createCompanyDataRepository } from './companyDataRepository';

type Row = Record<string, any>;
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const monthKey = (value: string) => value.slice(0, 7);
const monthName = (key: string) => { const [year, month] = key.split('-').map(Number); return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }); };

export function StatisticsPage({ companyId }: { companyId: string }) {
  const repo = useMemo(() => createCompanyDataRepository(supabase, companyId), [companyId]);
  const [rentals, setRentals] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { setRentals(await repo.fetchRentals() as Row[]); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar as estatísticas.'); }
    finally { setLoading(false); }
  }, [repo]);
  useEffect(() => { void load(); }, [load]);

  const metrics = useMemo(() => {
    const valid = rentals.filter(r => r.status !== 'cancelled');
    const completed = valid.filter(r => r.status === 'completed');
    const productMap = new Map<string, { name: string; quantity: number; rentals: number }>();
    const customerMap = new Map<string, { name: string; rentals: number; amount: number }>();
    const monthlyMap = new Map<string, number>();
    valid.forEach(r => {
      const customerId = r.customer_id ?? r.customers?.name ?? 'unknown';
      const customer = customerMap.get(customerId) ?? { name: r.customers?.name ?? 'Cliente', rentals: 0, amount: 0 };
      customer.rentals += 1; customer.amount += Number(r.total_amount ?? 0); customerMap.set(customerId, customer);
      const key = monthKey(r.start_date);
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + Number(r.total_amount ?? 0));
      (r.rental_items ?? []).forEach((item: Row) => {
        const id = item.product_id ?? item.products?.name ?? 'unknown';
        const product = productMap.get(id) ?? { name: item.products?.name ?? 'Brinquedo', quantity: 0, rentals: 0 };
        product.quantity += Number(item.quantity ?? 0); product.rentals += 1; productMap.set(id, product);
      });
    });
    const months = [...monthlyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6);
    return {
      total: rentals.length, active: valid.filter(r => ['pending', 'confirmed', 'ongoing'].includes(r.status)).length,
      completed: completed.length, cancelled: rentals.filter(r => r.status === 'cancelled').length,
      amount: valid.reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0),
      products: [...productMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5),
      customers: [...customerMap.values()].sort((a, b) => b.rentals - a.rentals).slice(0, 5),
      months,
    };
  }, [rentals]);

  const maxMonthly = Math.max(1, ...metrics.months.map(([, amount]) => amount));
  return <section className="module-shell stats-page">
    <header className="module-header"><div><p className="eyebrow">DESEMPENHO</p><h2>Estatísticas e histórico</h2><p className="module-description">Acompanhe locações, itens mais alugados e clientes recorrentes.</p></div><button type="button" className="secondary-button" onClick={() => void load()}>Atualizar</button></header>
    {message && <p className="module-feedback" role="status">{message}</p>}
    {loading ? <p className="module-empty">Calculando indicadores...</p> : <>
      <div className="stats-kpis"><article><span>Total de locações</span><strong>{metrics.total}</strong></article><article><span>Em andamento ou pendentes</span><strong>{metrics.active}</strong></article><article><span>Concluídas</span><strong>{metrics.completed}</strong></article><article><span>Canceladas</span><strong>{metrics.cancelled}</strong></article><article><span>Valor total das locações não canceladas</span><strong>{money(metrics.amount)}</strong></article></div>
      <div className="stats-panels">
        <section className="stats-panel"><h3>Brinquedos mais alugados</h3><p>Quantidade total de unidades registradas nas locações.</p>{metrics.products.length ? <ol>{metrics.products.map((item, index) => <li key={item.name}><span className="stats-rank">{index + 1}</span><div><strong>{item.name}</strong><small>{item.rentals} locação(ões)</small></div><b>{item.quantity} un.</b></li>)}</ol> : <div className="module-empty">Ainda não há itens no histórico.</div>}</section>
        <section className="stats-panel"><h3>Clientes recorrentes</h3><p>Clientes com maior número de locações registradas.</p>{metrics.customers.length ? <ol>{metrics.customers.map((item, index) => <li key={item.name}><span className="stats-rank">{index + 1}</span><div><strong>{item.name}</strong><small>{item.rentals} locação(ões)</small></div><b>{money(item.amount)}</b></li>)}</ol> : <div className="module-empty">Ainda não há clientes no histórico.</div>}</section>
      </div>
      <section className="stats-panel stats-monthly"><h3>Valores das locações por mês</h3><p>Soma dos valores das locações pela data de início; não representa necessariamente pagamentos recebidos.</p>{metrics.months.length ? <div className="stats-bars">{metrics.months.map(([key, amount]) => <div key={key}><div className="stats-bar-value">{money(amount)}</div><div className="stats-bar-track"><span style={{ height: `${Math.max(5, amount / maxMonthly * 100)}%` }} /></div><small>{monthName(key)}</small></div>)}</div> : <div className="module-empty">Ainda não há dados mensais suficientes.</div>}</section>
    </>}
  </section>;
}
