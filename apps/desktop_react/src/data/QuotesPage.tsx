import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type Row = Record<string, any>;
type QuoteDraftItem = { kind: 'product' | 'service' | 'custom'; refId: string; description: string; quantity: string; price: string };
const money = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => new Date().toLocaleDateString('en-CA');

export function QuotesPage({ companyId }: { companyId: string }) {
  const [quotes, setQuotes] = useState<Row[]>([]);
  const [customers, setCustomers] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [services, setServices] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [discount, setDiscount] = useState('0');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<QuoteDraftItem[]>([{ kind:'product', refId:'', description:'', quantity:'1', price:'0' }]);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [q,c,p,s] = await Promise.all([
        supabase.from('quotes').select('id,quote_number,status,issue_date,valid_until,total_amount,discount,customers(name),quote_items(description,quantity,subtotal)').eq('company_id',companyId).order('created_at',{ascending:false}),
        supabase.from('customers').select('id,name').eq('company_id',companyId).order('name'),
        supabase.from('products').select('id,name,daily_price').eq('company_id',companyId).eq('active',true).order('name'),
        supabase.from('services').select('id,name,price,price_unit').eq('company_id',companyId).eq('active',true).order('name'),
      ]);
      for (const result of [q,c,p,s]) if (result.error) throw result.error;
      setQuotes(q.data ?? []); setCustomers(c.data ?? []); setProducts(p.data ?? []); setServices(s.data ?? []);
      setMessage('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar os orçamentos.'); }
    finally { setLoading(false); }
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  const subtotal = useMemo(() => items.reduce((sum,item) => sum + Math.max(0,Number(item.quantity.replace(',','.')) || 0) * Math.max(0,Number(item.price.replace(',','.')) || 0),0), [items]);
  const discountValue = Math.max(0,Number(discount.replace(',','.')) || 0);
  const total = Math.max(0,subtotal-discountValue);

  function updateItem(index:number, patch:Partial<QuoteDraftItem>) {
    setItems(current => current.map((item,i) => i===index ? {...item,...patch} : item));
  }
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (items.some(item => (item.kind==='custom' ? !item.description.trim() : !item.refId) || !Number.isFinite(Number(item.quantity.replace(',','.'))) || Number(item.quantity.replace(',','.'))<=0 || !Number.isFinite(Number(item.price.replace(',','.'))) || Number(item.price.replace(',','.'))<0)) {
      setMessage('Confira a descrição, quantidade e preço de cada item.'); return;
    }
    if (discountValue > subtotal) { setMessage('O desconto não pode superar o subtotal.'); return; }
    setSaving(true);
    try {
      const payload = items.map(item => ({
        product_id: item.kind==='product' ? item.refId : null,
        service_id: item.kind==='service' ? item.refId : null,
        description: item.kind==='custom' ? item.description.trim() : null,
        quantity: Number(item.quantity.replace(',','.')),
        unit_price: Number(item.price.replace(',','.')),
      }));
      const { error } = await supabase.rpc('create_quote_with_items', {
        p_company_id: companyId, p_customer_id: customerId || null,
        p_valid_until: validUntil || null, p_discount: discountValue,
        p_notes: notes.trim() || null, p_items: payload,
      });
      if (error) throw error;
      setOpen(false); setCustomerId(''); setValidUntil(''); setDiscount('0'); setNotes('');
      setItems([{kind:'product',refId:'',description:'',quantity:'1',price:'0'}]);
      await load(); setMessage('Orçamento salvo com sucesso.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar o orçamento.'); }
    finally { setSaving(false); }
  }

  return <section className="module-shell">
    <header className="module-header"><div><p className="eyebrow">COMERCIAL</p><h2>Orçamentos</h2><p className="module-description">Monte propostas com brinquedos, serviços e itens personalizados.</p></div><button type="button" onClick={() => setOpen(value=>!value)}>{open ? 'Fechar' : 'Novo orçamento'}</button></header>
    {message && <p className="module-feedback" role="status">{message}</p>}
    {open && <form className="customer-form" onSubmit={save}>
      <h3>Montar orçamento</h3>
      <label>Cliente<select value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Sem cliente vinculado</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="form-grid"><label>Válido até<input type="date" min={today()} value={validUntil} onChange={e=>setValidUntil(e.target.value)} /></label><label>Desconto (R$)<input inputMode="decimal" value={discount} onChange={e=>setDiscount(e.target.value)} /></label></div>
      <div className="rental-items-heading"><h3>Itens</h3><button type="button" className="secondary-button" onClick={()=>setItems(current=>[...current,{kind:'product',refId:'',description:'',quantity:'1',price:'0'}])}>+ Adicionar item</button></div>
      {items.map((item,index)=><div className="rental-item-editor" key={index}>
        <div className="rental-item-top"><strong>Item {index+1}</strong><button type="button" className="remove-item-button" disabled={items.length===1} onClick={()=>setItems(current=>current.filter((_,i)=>i!==index))}>Remover</button></div>
        <div className="form-grid"><label>Tipo<select value={item.kind} onChange={e=>updateItem(index,{kind:e.target.value as QuoteDraftItem['kind'],refId:'',description:'',price:'0'})}><option value="product">Brinquedo</option><option value="service">Serviço</option><option value="custom">Personalizado</option></select></label>
        {item.kind==='custom' ? <label>Descrição<input value={item.description} onChange={e=>updateItem(index,{description:e.target.value})} /></label> : <label>{item.kind==='product'?'Brinquedo':'Serviço'}<select value={item.refId} onChange={e=>{const list=item.kind==='product'?products:services;const chosen=list.find((x:Row)=>x.id===e.target.value);updateItem(index,{refId:e.target.value,price:String(item.kind==='product'?chosen?.daily_price??0:chosen?.price??0)});}}><option value="">Selecione</option>{(item.kind==='product'?products:services).map((x:Row)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}</div>
        <div className="form-grid"><label>Quantidade<input required inputMode="decimal" value={item.quantity} onChange={e=>updateItem(index,{quantity:e.target.value})} /></label><label>Preço unitário (R$)<input required inputMode="decimal" value={item.price} onChange={e=>updateItem(index,{price:e.target.value})} /></label></div>
      </div>)}
      <label>Observações da proposta<textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} /></label>
      <div className="quote-total"><span>Subtotal: {money(subtotal)}</span><span>Desconto: {money(discountValue)}</span><strong>Total: {money(total)}</strong></div>
      <div className="form-actions"><button type="button" className="secondary-button" onClick={()=>setOpen(false)}>Cancelar</button><button type="submit" disabled={saving}>{saving?'Salvando...':'Salvar orçamento'}</button></div>
    </form>}
    {loading ? <p className="module-empty">Carregando orçamentos...</p> : quotes.length===0 ? <p className="module-empty">Nenhum orçamento criado ainda.</p> : <div className="customer-list">{quotes.map(q=><article className="customer-row quote-row" key={q.id}>
      <div className="customer-avatar">R$</div><div className="customer-info"><strong>Orçamento #{q.quote_number} · {q.customers?.name || 'Sem cliente'}</strong><span>{new Date(q.issue_date+'T12:00:00').toLocaleDateString('pt-BR')} · {q.quote_items?.length || 0} item(ns) · {q.status}</span><small>Validade: {q.valid_until ? new Date(q.valid_until+'T12:00:00').toLocaleDateString('pt-BR') : 'Não definida'}</small></div><strong>{money(Number(q.total_amount))}</strong>
    </article>)}</div>}
  </section>;
}
