import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AppSelect } from '../components/AppSelect';
import { supabase } from '../lib/supabase';

type Row = Record<string, any>;
type QuoteDraftItem = { kind: 'product' | 'service' | 'custom'; refId: string; description: string; quantity: string; price: string };
const money = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => new Date().toLocaleDateString('en-CA');
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => { if (char === '&') return '&amp;'; if (char === '<') return '&lt;'; if (char === '>') return '&gt;'; if (char === '"') return '&quot;'; return '&#39;'; });

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


  function printQuote(quote: Row) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { setMessage('Permita pop-ups para gerar a proposta em PDF.'); return; }
    const itemRows = (quote.quote_items ?? []).map((item: Row) =>
      `<tr><td>${escapeHtml(item.description)}</td><td>${Number(item.quantity)}</td><td>${money(Number(item.subtotal))}</td></tr>`
    ).join('');
    const customer = quote.customers?.name || 'Cliente';
    printWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Orçamento #${escapeHtml(quote.quote_number)}</title><style>
      body{font-family:Arial,sans-serif;color:#172033;margin:0;padding:36px;background:#f4f6f9}.sheet{max-width:760px;margin:auto;background:#fff;padding:42px;border:1px solid #e3e8ef;border-radius:12px}.brand{font-size:12px;font-weight:700;letter-spacing:2px;color:#687891}.top{display:flex;justify-content:space-between;gap:20px;align-items:start}h1{font-size:26px;margin:18px 0 6px}.muted{color:#6b778b;font-size:13px}.meta{margin:24px 0;padding:16px;background:#f6f8fb;border-radius:8px}.meta p{margin:6px 0;font-size:14px}table{width:100%;border-collapse:collapse;margin-top:22px}th,td{text-align:left;padding:13px 8px;border-bottom:1px solid #e8edf3;font-size:13px}th{color:#6b778b}.totals{margin:24px 0 0 auto;width:280px}.totals p{display:flex;justify-content:space-between}.grand{font-size:20px;font-weight:bold;border-top:2px solid #263b59;padding-top:14px}.notes{margin-top:24px;padding-top:16px;border-top:1px solid #e8edf3;font-size:13px;white-space:pre-wrap}.actions{text-align:right;margin-top:28px}.actions button{padding:12px 20px;background:#244f8c;color:white;border:0;border-radius:8px;font-weight:bold}@media print{body{background:#fff;padding:0}.sheet{border:0;border-radius:0;padding:20px}.actions{display:none}}
    </style></head><body><main class="sheet"><div class="top"><div><div class="brand">KIDSLOC APP</div><h1>Orçamento #${escapeHtml(quote.quote_number)}</h1><p class="muted">Proposta comercial</p></div><strong>${escapeHtml(new Date(quote.issue_date+'T12:00:00').toLocaleDateString('pt-BR'))}</strong></div><div class="meta"><p><b>Cliente:</b> ${escapeHtml(customer)}</p><p><b>Validade:</b> ${quote.valid_until ? escapeHtml(new Date(quote.valid_until+'T12:00:00').toLocaleDateString('pt-BR')) : 'Não definida'}</p></div><table><thead><tr><th>Descrição</th><th>Qtd.</th><th>Subtotal</th></tr></thead><tbody>${itemRows}</tbody></table><div class="totals"><p><span>Subtotal</span><b>${money(Number(quote.subtotal))}</b></p><p><span>Desconto</span><b>${money(Number(quote.discount))}</b></p><p class="grand"><span>Total</span><span>${money(Number(quote.total_amount))}</span></p></div>${quote.notes ? `<div class="notes"><b>Observações</b><br>${escapeHtml(quote.notes)}</div>` : ''}<div class="actions"><button onclick="window.print()">Imprimir / Salvar em PDF</button></div></main></body></html>`);
    printWindow.document.close();
  }

  function prepareWhatsApp(quote: Row) {
    const customer = quote.customers?.name || 'Olá';
    const message = `Olá, ${customer}! Segue nossa proposta KidsLoc nº ${quote.quote_number}. Valor total: ${money(Number(quote.total_amount))}. Validade: ${quote.valid_until ? new Date(quote.valid_until+'T12:00:00').toLocaleDateString('pt-BR') : 'a combinar'}. Vou anexar o orçamento em PDF nesta conversa.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  return <section className="module-shell">
    <header className="module-header"><div><p className="eyebrow">COMERCIAL</p><h2>Orçamentos</h2><p className="module-description">Monte propostas com brinquedos, serviços e itens personalizados.</p></div><button type="button" onClick={() => setOpen(value=>!value)}>{open ? 'Fechar' : 'Novo orçamento'}</button></header>
    {message && <p className="module-feedback" role="status">{message}</p>}
    {open && <form className="customer-form" onSubmit={save}>
      <h3>Montar orçamento</h3>
      <label>Cliente<AppSelect value={customerId} onChange={setCustomerId} placeholder="Sem cliente vinculado" options={[{ value: '', label: 'Sem cliente vinculado' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} /></label>
      <div className="form-grid"><label>Válido até<input type="date" min={today()} value={validUntil} onChange={e=>setValidUntil(e.target.value)} /></label><label>Desconto (R$)<input inputMode="decimal" value={discount} onChange={e=>setDiscount(e.target.value)} /></label></div>
      <div className="rental-items-heading"><h3>Itens</h3><button type="button" className="secondary-button" onClick={()=>setItems(current=>[...current,{kind:'product',refId:'',description:'',quantity:'1',price:'0'}])}>+ Adicionar item</button></div>
      {items.map((item,index)=><div className="rental-item-editor" key={index}>
        <div className="rental-item-top"><strong>Item {index+1}</strong><button type="button" className="remove-item-button" disabled={items.length===1} onClick={()=>setItems(current=>current.filter((_,i)=>i!==index))}>Remover</button></div>
        <div className="form-grid"><label>Tipo<AppSelect value={item.kind} onChange={value=>updateItem(index,{kind:value as QuoteDraftItem['kind'],refId:'',description:'',price:'0'})} placeholder="Tipo de item" options={[{value:'product',label:'Brinquedo'},{value:'service',label:'Serviço'},{value:'custom',label:'Personalizado'}]} /></label>
        {item.kind==='custom' ? <label>Descrição<input value={item.description} onChange={e=>updateItem(index,{description:e.target.value})} /></label> : <label>{item.kind==='product'?'Brinquedo':'Serviço'}<AppSelect value={item.refId} onChange={value=>{const list=item.kind==='product'?products:services;const chosen=list.find((x:Row)=>x.id===value);updateItem(index,{refId:value,price:String(item.kind==='product'?chosen?.daily_price??0:chosen?.price??0)});}} placeholder="Selecione" options={[{value:'',label:'Selecione'},...(item.kind==='product'?products:services).map((x:Row)=>({value:x.id,label:x.name}))]} /></label>}</div>
        <div className="form-grid"><label>Quantidade<input required inputMode="decimal" value={item.quantity} onChange={e=>updateItem(index,{quantity:e.target.value})} /></label><label>Preço unitário (R$)<input required inputMode="decimal" value={item.price} onChange={e=>updateItem(index,{price:e.target.value})} /></label></div>
      </div>)}
      <label>Observações da proposta<textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} /></label>
      <div className="quote-total"><span>Subtotal: {money(subtotal)}</span><span>Desconto: {money(discountValue)}</span><strong>Total: {money(total)}</strong></div>
      <div className="form-actions"><button type="button" className="secondary-button" onClick={()=>setOpen(false)}>Cancelar</button><button type="submit" disabled={saving}>{saving?'Salvando...':'Salvar orçamento'}</button></div>
    </form>}
    {loading ? <p className="module-empty">Carregando orçamentos...</p> : quotes.length===0 ? <p className="module-empty">Nenhum orçamento criado ainda.</p> : <div className="customer-list">{quotes.map(q=><article className="customer-row quote-row" key={q.id}>
      <div className="customer-avatar">R$</div><div className="customer-info"><strong>Orçamento #{q.quote_number} · {q.customers?.name || 'Sem cliente'}</strong><span>{new Date(q.issue_date+'T12:00:00').toLocaleDateString('pt-BR')} · {q.quote_items?.length || 0} item(ns) · {q.status}</span><small>Validade: {q.valid_until ? new Date(q.valid_until+'T12:00:00').toLocaleDateString('pt-BR') : 'Não definida'}</small></div><strong>{money(Number(q.total_amount))}</strong><div className="quote-actions"><button type="button" className="secondary-button" onClick={()=>printQuote(q)}>Imprimir / PDF</button><button type="button" className="secondary-button" onClick={()=>prepareWhatsApp(q)}>Preparar WhatsApp</button></div>
    </article>)}</div>}
  </section>;
}
