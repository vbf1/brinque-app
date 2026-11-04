import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Rental = Record<string, any>;
type Contract = Record<string, any>;
const money = (value: unknown) => Number(value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value: string) => value ? new Date(value + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const clauses = [
  'O contratante declara que recebeu as informações sobre os brinquedos alugados e compromete-se a utilizá-los conforme as orientações fornecidas pela locadora.',
  'O contratante deverá zelar pela conservação dos equipamentos durante todo o período da locação e impedir o uso inadequado ou por pessoas não autorizadas.',
  'Danos, perdas ou avarias decorrentes de mau uso, negligência ou descumprimento das orientações deverão ser comunicados imediatamente e poderão gerar obrigação de ressarcimento, mediante apuração.',
  'A utilização deverá ocorrer no período contratado. A devolução ou retirada deverá respeitar as datas e condições combinadas com a locadora.',
  'Os valores, descontos, taxas e condições de pagamento são os apresentados neste contrato e no resumo da locação.',
  'O contratante declara ser responsável por supervisionar a utilização dos brinquedos e por seguir as instruções de segurança entregues pela locadora.',
  'Alterações e cancelamentos deverão ser comunicados à locadora e dependerão de confirmação entre as partes.'
];
function printable(snapshot: Record<string, any>, number?: number) {
  const items = (snapshot.items ?? []).map((i: any) => '<tr><td>' + i.name + '</td><td>' + i.quantity + '</td><td>' + money(i.dailyPrice) + '</td><td>' + money(i.subtotal) + '</td></tr>').join('');
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Contrato ${number ?? ''}</title><style>body{font:14px Arial;color:#222;max-width:800px;margin:36px auto;line-height:1.5}h1{text-align:center;font-size:20px}h2{font-size:15px;margin-top:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #bbb;padding:8px;text-align:left}.sign{margin-top:55px;display:flex;gap:70px}.sign div{border-top:1px solid #444;flex:1;text-align:center;padding-top:8px}@media print{body{margin:18mm}}</style><h1>CONTRATO DE LOCAÇÃO DE BRINQUEDOS</h1><p><b>Locadora:</b> ${snapshot.companyName}</p><p><b>Cliente:</b> ${snapshot.customerName}<br><b>Telefone:</b> ${snapshot.customerPhone || '—'}<br><b>Endereço:</b> ${snapshot.customerAddress || '—'}</p><p><b>Locação:</b> ${number ?? ''} &nbsp; <b>Período:</b> ${date(snapshot.startDate)} a ${date(snapshot.endDate)}</p><h2>ITENS LOCADOS</h2><table><thead><tr><th>Brinquedo</th><th>Qtd.</th><th>Diária</th><th>Subtotal</th></tr></thead><tbody>${items}</tbody></table><p><b>Valor total: ${money(snapshot.totalAmount)}</b></p><p><b>Caução/garantia:</b> ${money(snapshot.depositAmount)}</p><p><b>Endereço de entrega:</b> ${snapshot.deliveryAddress || '—'}</p><h2>CONDIÇÕES</h2><ol>${clauses.map(c => '<li>' + c + '</li>').join('')}</ol><h2>ASSINATURAS</h2><p>As partes declaram que leram e concordam com as condições acima. ${snapshot.rentalNotes ? 'Observações da locação: ' + snapshot.rentalNotes : ''}</p><div class="sign"><div>LOCADORA</div><div>CONTRATANTE</div></div></html>`;
}
export function ContractsPage({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedRental, setSelectedRental] = useState('');
  const [method, setMethod] = useState<'external' | 'in_app'>('external');
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    const [r, c] = await Promise.all([
      supabase.from('rentals').select('*, customers(name, phone, email, address), rental_items(quantity, unit_price, subtotal, products(name))').eq('company_id', companyId).order('created_at', { ascending: false }),
      supabase.from('rental_contracts').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
    ]);
    if (r.error || c.error) setMessage(r.error?.message ?? c.error?.message ?? 'Não foi possível carregar os contratos.');
    else { setRentals(r.data ?? []); setContracts(c.data ?? []); }
    setLoading(false);
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  async function createContract() {
    const rental = rentals.find(r => r.id === selectedRental);
    if (!rental) { setMessage('Selecione uma locação.'); return; } const phoneDigits = Array.from(String(rental.customers?.phone ?? '')).filter((digit) => digit >= '0' && digit <= '9').join(''); if (phoneDigits.length < 10 || phoneDigits.length > 13) { setMessage('Cadastre um telefone válido com DDD para preparar o WhatsApp.'); return; }
    setBusy(true); setMessage('');
    try {
      const rawToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken))), b => b.toString(16).padStart(2, '0')).join('');
      const snapshot = {
        companyName, customerName: rental.customers?.name ?? 'Cliente', customerPhone: rental.customers?.phone ?? '',
        customerAddress: rental.customers?.address ?? rental.delivery_address ?? '',
        startDate: rental.start_date, endDate: rental.end_date, totalAmount: rental.total_amount,
        rentalNumber: rental.rental_number,
        items: (rental.rental_items ?? []).map((i: any) => ({ name: i.products?.name ?? 'Brinquedo', quantity: i.quantity, dailyPrice: i.unit_price, subtotal: i.subtotal ?? Number(i.unit_price) * Number(i.quantity) })),         clauses, depositAmount: rental.deposit_amount ?? 0, deliveryAddress: rental.delivery_address ?? '', rentalNotes: rental.notes ?? ''
      };
      const { data, error } = await supabase.from('rental_contracts').insert({
        company_id: companyId, rental_id: rental.id, signature_method: method, status: 'sent', sent_at: new Date().toISOString(),
        contract_snapshot: snapshot, token_hash: method === 'in_app' ? hash : null,
        token_expires_at: method === 'in_app' ? new Date(Date.now() + 7 * 86400000).toISOString() : null,
        created_by: (await supabase.auth.getUser()).data.user?.id
      }).select('*').single();
      if (error) throw error;
      const html = printable(snapshot, data.contract_number);
      const win = window.open('', '_blank');
      if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 300); }
      if (method === 'in_app') {
        const link = window.location.origin + window.location.pathname + '?contract=' + rawToken;
        const text = encodeURIComponent('Olá! Seu contrato de locação está disponível para leitura e assinatura pelo KidsLoc: ' + link);
        window.open('https://wa.me/' + phoneDigits + '?text=' + text, '_blank');
      } else {
        const text = encodeURIComponent('Olá! Estou enviando seu contrato de locação em PDF. Por favor, assine pelo Gov.br ou outro serviço de assinatura eletrônica e devolva o PDF assinado por aqui.');
        window.open('https://wa.me/' + phoneDigits + '?text=' + text, '_blank');
      }
      setSelectedRental(''); await load();
      setMessage(method === 'external' ? 'Contrato criado. Salve o PDF gerado e anexe-o à conversa do WhatsApp.' : 'Contrato criado e link de assinatura preparado no WhatsApp.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao criar contrato.'); }
    finally { setBusy(false); }
  }

  async function receiveSigned(contract: Contract, file?: File) {
    if (!file) return;
    if (file.type !== 'application/pdf' || file.size > 10 * 1024 * 1024) { setMessage('Selecione um PDF de até 10 MB.'); return; }
    setUploading(contract.id);
    try {
      const path = companyId + '/' + contract.id + '/contrato-assinado.pdf';
      const { error: uploadError } = await supabase.storage.from('rental-contracts').upload(path, file, { upsert: true, contentType: 'application/pdf' });
      if (uploadError) throw uploadError;
      const { error } = await supabase.from('rental_contracts').update({ status: 'signed', signed_at: new Date().toISOString(), signed_pdf_path: path }).eq('id', contract.id).eq('company_id', companyId);
      if (error) throw error;
      await load(); setMessage('PDF assinado anexado e contrato atualizado.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível anexar o PDF.'); }
    finally { setUploading(''); }
  }

  async function openOriginal(contract: Contract) {
    const { data, error } = await supabase.storage.from('rental-contracts').createSignedUrl(contract.original_pdf_path ?? '', 300);
    if (error) setMessage(error.message); else if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  return <section className="module-shell">
    <header className="module-header"><div><p className="eyebrow">DOCUMENTOS</p><h2>Contratos de locação</h2><p className="module-description">Gere contratos e acompanhe as assinaturas externas ou pelo KidsLoc.</p></div><button type="button" onClick={() => void load()}>Atualizar</button></header>
    <div className="marketing-editor">
      <h3>Novo contrato</h3>
      <label>Locação<select value={selectedRental} onChange={e => setSelectedRental(e.target.value)}><option value="">Selecione uma locação</option>{rentals.map(r => <option key={r.id} value={r.id}>#{r.rental_number} · {r.customers?.name ?? 'Cliente'} · {date(r.start_date)}</option>)}</select></label>
      <label>Modalidade de assinatura<select value={method} onChange={e => setMethod(e.target.value as 'external' | 'in_app')}><option value="external">Gov.br ou outro serviço externo</option><option value="in_app">Assinar diretamente pelo KidsLoc</option></select></label>
      <button type="button" disabled={busy || !selectedRental} onClick={() => void createContract()}>{busy ? 'Gerando...' : 'Gerar contrato e preparar WhatsApp'}</button>
    </div>
    {message && <p className="marketing-manual-note" role="status">{message}</p>}
    {loading ? <p>Carregando...</p> : <div className="module-list">{contracts.map(c => <article className="marketing-ad-card" key={c.id}>
      <div><strong>Contrato #{c.contract_number}</strong><p>{c.contract_snapshot?.customerName} · Locação {c.rental_id}</p><small>{c.signature_method === 'in_app' ? 'Assinatura pelo KidsLoc' : 'Assinatura externa'} · {c.status} · {new Date(c.created_at).toLocaleString('pt-BR')}</small></div>
      <div className="marketing-actions"><button type="button" onClick={() => { const w = window.open('', '_blank'); if (w) { w.document.write(printable(c.contract_snapshot, c.contract_number)); w.document.close(); w.print(); } }}>Imprimir PDF</button>{c.signature_method === 'external' && c.status !== 'signed' && <label className="marketing-upload-button">Anexar PDF assinado<input type="file" accept="application/pdf" disabled={uploading === c.id} onChange={e => void receiveSigned(c, e.target.files?.[0])} /></label>}{c.signed_pdf_path && <button type="button" onClick={() => void (async () => { const { data, error } = await supabase.storage.from('rental-contracts').createSignedUrl(c.signed_pdf_path, 300); if (error) setMessage(error.message); else if (data?.signedUrl) window.open(data.signedUrl, '_blank'); })()}>Abrir assinado</button>}</div>
    </article>)}</div>}
  </section>;
}
