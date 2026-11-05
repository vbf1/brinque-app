import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createCompanyDataRepository } from './companyDataRepository';

type Row = Record<string, any>;
const pad = (value: number) => String(value).padStart(2, '0');
const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDate = (value: string) => new Date(`${value}T12:00:00`);
const monthLabel = (date: Date) => date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const dateLabel = (value: string) => parseDate(value).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const activeStatuses = new Set(['pending', 'confirmed', 'ongoing']);
const statusLabel: Record<string, string> = { pending: 'Pendente', confirmed: 'Confirmada', ongoing: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' };

export function AgendaPage({ companyId, onOpenRentals }: { companyId: string; onOpenRentals: () => void }) {
  const repo = useMemo(() => createCompanyDataRepository(supabase, companyId), [companyId]);
  const [rentals, setRentals] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => iso(new Date()));

  const load = useCallback(async () => {
    setLoading(true);
    try { setRentals(await repo.fetchRentals() as Row[]); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar a agenda.'); }
    finally { setLoading(false); }
  }, [repo]);
  useEffect(() => { void load(); }, [load]);

  const calendarDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, index) => iso(new Date(month.getFullYear(), month.getMonth(), index + 1)))];
  }, [month]);

  const bookingsByDay = useMemo(() => {
    const map = new Map<string, Row[]>();
    rentals.filter(r => r.status !== 'cancelled').forEach(rental => {
      const start = parseDate(rental.start_date); const end = parseDate(rental.end_date);
      for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
        const key = iso(day); map.set(key, [...(map.get(key) ?? []), rental]);
      }
    });
    return map;
  }, [rentals]);

  const selectedBookings = bookingsByDay.get(selectedDate) ?? [];
  const monthBookings = rentals.filter(r => r.status !== 'cancelled' && r.start_date <= iso(new Date(month.getFullYear(), month.getMonth() + 1, 0)) && r.end_date >= iso(month));
  const activeCount = monthBookings.filter(r => activeStatuses.has(r.status)).length;
  const confirmedCount = monthBookings.filter(r => r.status === 'confirmed').length;
  const pendingCount = monthBookings.filter(r => r.status === 'pending').length;

  function changeMonth(delta: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next); setSelectedDate(iso(next));
  }

  return <section className="module-shell agenda-page">
    <header className="module-header"><div><p className="eyebrow">PLANEJAMENTO</p><h2>Agenda de reservas</h2><p className="module-description">Visualize as locações por dia e acompanhe os períodos ocupados.</p></div><div className="agenda-header-actions"><button type="button" className="secondary-button" onClick={() => void load()}>Atualizar</button><button type="button" onClick={onOpenRentals}>Nova locação</button></div></header>
    {message && <p className="module-feedback" role="status">{message}</p>}
    <div className="agenda-summary"><article><span>Reservas no mês</span><strong>{monthBookings.length}</strong></article><article><span>Ativas</span><strong>{activeCount}</strong></article><article><span>Confirmadas</span><strong>{confirmedCount}</strong></article><article><span>Pendentes</span><strong>{pendingCount}</strong></article></div>
    <div className="agenda-layout">
      <section className="agenda-calendar" aria-label="Calendário de reservas">
        <div className="agenda-month-heading"><button type="button" className="secondary-button" aria-label="Mês anterior" onClick={() => changeMonth(-1)}>‹</button><h3>{monthLabel(month)}</h3><button type="button" className="secondary-button" aria-label="Próximo mês" onClick={() => changeMonth(1)}>›</button><button type="button" className="secondary-button agenda-today" onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDate(iso(now)); }}>Hoje</button></div>
        <div className="agenda-grid agenda-weekdays">{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(day => <span key={day}>{day}</span>)}</div>
        <div className="agenda-grid">{calendarDays.map((day, index) => day ? <button type="button" key={day} className={`agenda-day ${selectedDate === day ? 'selected' : ''} ${day === iso(new Date()) ? 'today' : ''}`} onClick={() => setSelectedDate(day)} aria-pressed={selectedDate === day}><span>{Number(day.slice(-2))}</span>{(bookingsByDay.get(day)?.length ?? 0) > 0 && <small>{bookingsByDay.get(day)!.length} reserva(s)</small>}</button> : <span key={`empty-${index}`} className="agenda-day-empty" />)}</div>
        <p className="agenda-legend"><i /> Dias com reservas · A contagem considera os períodos completos das locações, não apenas o dia de início.</p>
      </section>
      <aside className="agenda-day-panel"><div className="agenda-day-title"><div><p className="eyebrow">DETALHAMENTO</p><h3>{dateLabel(selectedDate)}</h3></div><span>{selectedBookings.length}</span></div>
        {loading ? <p className="module-empty">Carregando reservas...</p> : selectedBookings.length === 0 ? <div className="agenda-empty"><span>▦</span><strong>Nenhuma reserva neste dia</strong><small>Selecione outra data ou crie uma nova locação.</small></div> : <div className="agenda-bookings">{selectedBookings.map(rental => <article key={rental.id}><div className="agenda-booking-top"><strong>{rental.customers?.name ?? 'Cliente'}</strong><span className={`agenda-status status-${rental.status}`}>{statusLabel[rental.status] ?? rental.status}</span></div><p>{(rental.rental_items ?? []).map((item: Row) => `${item.quantity}× ${item.products?.name ?? 'Brinquedo'}`).join(', ')}</p><small>{parseDate(rental.start_date).toLocaleDateString('pt-BR')} – {parseDate(rental.end_date).toLocaleDateString('pt-BR')}</small><strong className="agenda-booking-value">{money(Number(rental.total_amount ?? 0))}</strong></article>)}</div>}
        <button type="button" className="secondary-button agenda-all-rentals" onClick={onOpenRentals}>Abrir todas as locações</button>
      </aside>
    </div>
  </section>;
}
