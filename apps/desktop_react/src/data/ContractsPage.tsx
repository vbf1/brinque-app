import { useCallback, useEffect, useState } from 'react';
import { AppSelect } from '../components/AppSelect';
import { supabase } from '../lib/supabase';

type Rental = Record<string, any>;
type Contract = Record<string, any>;
const clauses = [
  'O contratante declara que recebeu as informações sobre os brinquedos alugados e compromete-se a utilizá-los conforme as orientações fornecidas pela locadora.',
  'O contratante deverá zelar pela conservação dos equipamentos durante todo o período da locação e impedir o uso inadequado ou por pessoas não autorizadas.',
  'Danos, perdas ou avarias decorrentes de mau uso, negligência ou descumprimento das orientações deverão ser comunicados imediatamente e poderão gerar obrigação de ressarcimento, mediante apuração.',
  'A utilização deverá ocorrer no período contratado. A devolução ou retirada deverá respeitar as datas e condições combinadas com a locadora.',
  'Os valores, descontos, taxas e condições de pagamento são os apresentados neste contrato e no resumo da locação.',
  'O contratante declara ser responsável por supervisionar a utilização dos brinquedos e por seguir as instruções de segurança entregues pela locadora.',
  'Alterações e cancelamentos deverão ser comunicados à locadora e dependerão de confirmação entre as partes.'
];
const money = (value: unknown) => Number(value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value: string) => value ? new Date(value + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const htmlEscapes: Record<string,string> = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => htmlEscapes[char] ?? char);
const statusLabels: Record<string,string> = { draft:'Pendente', sent:'Enviado', viewed:'Visualizado', signed:'Assinado', cancelled:'Cancelado', expired:'Vencido' };

function printable(snapshot: Record<string, any>, number?: number) {
  const items = (Array.isArray(snapshot.items) ? snapshot.items : []).map((item: any) =>
    '<tr><td>' + escapeHtml(item.name) + '</td><td>' + escapeHtml(item.quantity) + '</td><td>' + money(item.dailyPrice) + '</td><td>' + money(item.subtotal) + '</td></tr>'
  ).join('');
  const terms = Array.isArray(snapshot.clauses) ? snapshot.clauses : clauses;
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Contrato ' + escapeHtml(number ?? '') + '</title><style>body{font:14px Arial;color:#222;max-width:800px;margin:36px auto;line-height:1.5}h1{text-align:center;font-size:20px}h2{font-size:15px;margin-top:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #bbb;padding:8px;text-align:left}.sign{margin-top:55px;display:flex;gap:70px}.sign div{border-top:1px solid #444;flex:1;text-align:center;padding-top:8px}@media print{body{margin:18mm}}</style></head><body>' +
    '<h1>CONTRATO DE LOCAÇÃO DE BRINQUEDOS</h1><p><b>Locadora:</b> ' + escapeHtml(snapshot.companyName) + '</p>' +
    '<p><b>Cliente:</b> ' + escapeHtml(snapshot.customerName) + '<br><b>Telefone:</b> ' + escapeHtml(snapshot.customerPhone || '—') + '<br><b>Endereço:</b> ' + escapeHtml(snapshot.customerAddress || '—') + '</p>' +
    '<p><b>Locação:</b> ' + escapeHtml(number ?? '') + ' &nbsp; <b>Período:</b> ' + escapeHtml(date(snapshot.startDate)) + ' a ' + escapeHtml(date(snapshot.endDate)) + '</p>' +
    '<h2>ITENS LOCADOS</h2><table><thead><tr><th>Brinquedo</th><th>Qtd.</th><th>Diária</th><th>Subtotal</th></tr></thead><tbody>' + items + '</tbody></table>' +
    '<p><b>Valor total: ' + money(snapshot.totalAmount) + '</b></p><p><b>Caução/garantia:</b> ' + money(snapshot.depositAmount) + '</p><p><b>Endereço de entrega:</b> ' + escapeHtml(snapshot.deliveryAddress || '—') + '</p>' +
    '<h2>CONDIÇÕES</h2><ol>' + terms.map((clause: unknown) => '<li>' + escapeHtml(clause) + '</li>').join('') + '</ol>' +
    '<h2>ASSINATURAS</h2><p>As partes declaram que leram e concordam com as condições acima. ' + escapeHtml(snapshot.rentalNotes ? 'Observações da locação: ' + snapshot.rentalNotes : '') + '</p>' +
    '<div class="sign"><div>LOCADORA</div><div>CONTRATANTE</div></div></body></html>';
}

function makeToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
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
  const [generatedTokens, setGeneratedTokens] = useState<Record<string,string>>({});

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
    const rental = rentals.find(item => item.id === selectedRental);
    if (!rental) { setMessage('Selecione uma locação.'); return; }
    const phoneDigits = Array.from(String(rental.customers?.phone ?? '')).filter(digit => digit >= '0' && digit <= '9').join('');
    if (phoneDigits.length < 10 || phoneDigits.length > 13) { setMessage('Cadastre um telefone válido com DDD para preparar o WhatsApp.'); return; }
    setBusy(true); setMessage('');
    try {
      const rawToken = method === 'in_app' ? makeToken() : '';
      const tokenHash = rawToken ? await hashToken(rawToken) : null;
      const snapshot = {
        companyName, customerName: rental.customers?.name ?? 'Cliente', customerPhone: rental.customers?.phone ?? '',
        customerAddress: rental.customers?.address ?? rental.delivery_address ?? '',
        startDate: rental.start_date, endDate: rental.end_date, totalAmount: rental.total_amount,
        rentalNumber: rental.rental_number,
        items: (rental.rental_items ?? []).map((item: any) => ({ name: item.products?.name ?? 'Brinquedo', quantity: item.quantity, dailyPrice: item.unit_price, subtotal: item.subtotal ?? Number(item.unit_price) * Number(item.quantity) })),
        clauses, depositAmount: rental.deposit_amount ?? 0, deliveryAddress: rental.delivery_address ?? '', rentalNotes: rental.notes ?? ''
      };
      const { data, error } = await supabase.from('rental_contracts').insert({
        company_id: companyId, rental_id: rental.id, signature_method: method, status: 'draft',
        contract_snapshot: snapshot, token_hash: tokenHash,
        token_expires_at: rawToken ? new Date(Date.now() + 7 * 86400000).toISOString() : null,
        created_by: (await supabase.auth.getUser()).data.user?.id
      }).select('*').single();
      if (error) throw error;
      if (rawToken) setGeneratedTokens(current => ({ ...current, [data.id]: rawToken }));
      setSelectedRental('');
      await load();
      setMessage('Contrato criado como rascunho. Gere ou confira o PDF, envie pelo WhatsApp e depois marque como enviado.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao criar contrato.'); }
    finally { setBusy(false); }
  }

  function printContract(contract: Contract) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { setMessage('O navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.'); return; }
    printWindow.document.open();
    printWindow.document.write(printable(contract.contract_snapshot ?? {}, contract.contract_number));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  }

  function openWhatsApp(contract: Contract) {
    const snapshot = contract.contract_snapshot ?? {};
    const digits = Array.from(String(snapshot.customerPhone ?? '')).filter(digit => digit >= '0' && digit <= '9').join('');
    if (digits.length < 10 || digits.length > 13) { setMessage('O telefone salvo no contrato não é válido.'); return; }
    let messageText = 'Olá! Estou enviando o contrato de locação em PDF. Por favor, assine pelo Gov.br ou outro serviço de assinatura eletrônica e devolva o PDF assinado por aqui.';
    if (contract.signature_method === 'in_app') {
      const token = generatedTokens[contract.id];
      if (!token) { setMessage('Gere um novo link de assinatura antes de abrir o WhatsApp.'); return; }
      const link = window.location.origin + window.location.pathname + '?contract=' + encodeURIComponent(token);
      messageText = 'Olá! Seu contrato de locação está disponível para leitura e assinatura pelo KidsLoc: ' + link;
    }
    window.open('https://wa.me/' + digits + '?text=' + encodeURIComponent(messageText), '_blank', 'noopener,noreferrer');
    setMessage(contract.signature_method === 'external' ? 'WhatsApp aberto. Anexe o PDF salvo e envie ao cliente.' : 'WhatsApp aberto com o link de assinatura.');
  }

  async function regenerateLink(contract: Contract) {
    setBusy(true); setMessage('');
    try {
      const rawToken = makeToken();
      const tokenHash = await hashToken(rawToken);
      const { data, error } = await supabase.from('rental_contracts').update({
        token_hash: tokenHash, token_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        status: 'draft', sent_at: null, viewed_at: null
      }).eq('id', contract.id).eq('company_id', companyId).neq('status', 'signed').select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Este contrato não pode receber um novo link.');
      setGeneratedTokens(current => ({ ...current, [contract.id]: rawToken }));
      await load();
      setMessage('Novo link gerado. Envie pelo WhatsApp e marque o contrato como enviado.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível gerar o link.'); }
    finally { setBusy(false); }
  }

  async function markSent(contract: Contract) {
    setBusy(true);
    try {
      const { data, error } = await supabase.from('rental_contracts').update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', contract.id).eq('company_id', companyId).eq('status', 'draft').select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('O contrato não está mais como rascunho.');
      await load(); setMessage('Contrato marcado como enviado.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o status.'); }
    finally { setBusy(false); }
  }

  async function cancelContract(contract: Contract) {
    if (!window.confirm('Cancelar este contrato? O link de assinatura deixará de funcionar.')) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('rental_contracts').update({ status: 'cancelled', token_hash: null, token_expires_at: null })
        .eq('id', contract.id).eq('company_id', companyId).neq('status', 'signed');
      if (error) throw error;
      await load(); setMessage('Contrato cancelado.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível cancelar o contrato.'); }
    finally { setBusy(false); }
  }

  async function receiveSigned(contract: Contract, file?: File) {
    if (!file) return;
    if (file.type !== 'application/pdf' || file.size > 10 * 1024 * 1024) { setMessage('Selecione um PDF de até 10 MB.'); return; }
    setUploading(contract.id);
    const path = companyId + '/' + contract.id + '/contrato-assinado.pdf';
    try {
      const { error: uploadError } = await supabase.storage.from('rental-contracts').upload(path, file, { upsert: true, contentType: 'application/pdf' });
      if (uploadError) throw uploadError;
      const { data, error } = await supabase.from('rental_contracts').update({ status: 'signed', signed_at: new Date().toISOString(), signed_pdf_path: path })
        .eq('id', contract.id).eq('company_id', companyId).in('status', ['sent','viewed']).select('id').maybeSingle();
      if (error || !data) {
        await supabase.storage.from('rental-contracts').remove([path]);
        throw error ?? new Error('O contrato precisa estar enviado para receber a assinatura.');
      }
      await load(); setMessage('PDF assinado anexado e contrato atualizado.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível anexar o PDF.'); }
    finally { setUploading(''); }
  }

  async function openSigned(contract: Contract) {
    const win = window.open('', '_blank');
    if (!win) { setMessage('Permita pop-ups para abrir o documento assinado.'); return; }
    const { data, error } = await supabase.storage.from('rental-contracts').createSignedUrl(contract.signed_pdf_path, 300);
    if (error || !data?.signedUrl) { win.close(); setMessage(error?.message ?? 'Documento não encontrado.'); }
    else win.location.href = data.signedUrl;
  }

  return <section className="module-shell">
    <header className="module-header"><div><p className="eyebrow">DOCUMENTOS</p><h2>Contratos de locação</h2><p className="module-description">Gere contratos e acompanhe as assinaturas externas ou pelo KidsLoc.</p></div><button type="button" onClick={() => void load()}>Atualizar</button></header>
    <div className="marketing-editor">
      <h3>Novo contrato</h3>
      <label>Locação<AppSelect value={selectedRental} onChange={setSelectedRental} placeholder="Selecione uma locação" options={[{value:'',label:'Selecione uma locação'},...rentals.map(rental=>({value:rental.id,label:`#${rental.rental_number} · ${rental.customers?.name ?? 'Cliente'} · ${date(rental.start_date)}`}))]} /></label>
      <label>Modalidade de assinatura<AppSelect value={method} onChange={value => setMethod(value as 'external' | 'in_app')} placeholder="Modalidade de assinatura" options={[{value:'external',label:'Gov.br ou outro serviço externo'},{value:'in_app',label:'Assinar diretamente pelo KidsLoc'}]} /></label>
      <button type="button" disabled={busy || !selectedRental} onClick={() => void createContract()}>{busy ? 'Gerando...' : 'Criar contrato'}</button>
    </div>
    {message && <p className="marketing-manual-note" role="status">{message}</p>}
    {loading ? <p>Carregando...</p> : <div className="module-list">{contracts.map(contract => {
      const snapshot = contract.contract_snapshot ?? {};
      const terminal = ['signed','cancelled','expired'].includes(contract.status);
      return <article className="marketing-ad-card" key={contract.id}>
        <div><strong>Contrato #{contract.contract_number}</strong><p>{snapshot.customerName ?? 'Cliente'} · Locação #{snapshot.rentalNumber ?? '—'}</p><small>{contract.signature_method === 'in_app' ? 'Assinatura pelo KidsLoc' : 'Assinatura externa'} · {statusLabels[contract.status] ?? contract.status} · {new Date(contract.created_at).toLocaleString('pt-BR')}</small></div>
        <div className="marketing-actions">
          <button type="button" onClick={() => printContract(contract)}>Imprimir / salvar PDF</button>
          {contract.signature_method === 'in_app' && !terminal && <button type="button" className="secondary-button" disabled={busy} onClick={() => void regenerateLink(contract)}>Gerar novo link</button>}
          {!terminal && <button type="button" className="secondary-button" onClick={() => openWhatsApp(contract)}>Abrir WhatsApp</button>}
          {contract.status === 'draft' && <button type="button" disabled={busy} onClick={() => void markSent(contract)}>Marcar como enviado</button>}
          {contract.signature_method === 'external' && ['sent','viewed'].includes(contract.status) && <label className="marketing-upload-button">Anexar PDF assinado<input type="file" accept="application/pdf" disabled={uploading === contract.id} onChange={event => void receiveSigned(contract, event.target.files?.[0])} /></label>}
          {contract.signed_pdf_path && <button type="button" onClick={() => void openSigned(contract)}>Abrir PDF assinado</button>}
          {!terminal && <button type="button" className="danger-button" disabled={busy} onClick={() => void cancelContract(contract)}>Cancelar</button>}
        </div>
      </article>;
    })}</div>}
  </section>;
}
