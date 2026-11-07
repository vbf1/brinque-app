import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { buildRentalContractHtml } from './contractTemplate';
import { ContractBrandingSettings } from './ContractBrandingSettings';

type Rental = Record<string, any>;
type Contract = Record<string, any>;
const date = (value: string) => value ? new Date(value + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const statusLabels: Record<string,string> = { draft:'Pendente', sent:'Enviado', viewed:'Visualizado', signed:'Assinado', cancelled:'Cancelado', expired:'Vencido' };


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
  const [extraFields, setExtraFields] = useState({ customerCpf:'', customerRg:'', customerZip:'', customerNeighborhood:'', customerCityState:'', eventAddress:'', eventNeighborhood:'', eventCityState:'', pickupDate:'', dueDateText:'', signaturePlace:'' });

  const load = useCallback(async () => {
    setLoading(true);
    const [r, c] = await Promise.all([
      supabase.from('rentals').select('*, customers(name, phone, email, address, cpf, rg, zip, neighborhood, city_state), rental_items(quantity, unit_price, subtotal, products(name))').eq('company_id', companyId).order('created_at', { ascending: false }),
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
      const { data: companyData, error: companyError } = await supabase.from('companies')
        .select('name,contract_logo_url,contract_settings').eq('id', companyId).single();
      if (companyError) throw companyError;
      const config = companyData.contract_settings ?? {};
      const customer = rental.customers ?? {};
      const total = Number(rental.total_amount ?? 0);
      const signalPercent = 30;
      const signal = total * signalPercent / 100;
      const snapshot = {
        companyName,
        landlord: {
          name: config.landlordName ?? '', cpf: config.landlordCpf ?? '', phone: config.landlordPhone ?? '',
          commercialName: config.commercialName || companyName, address: config.landlordAddress ?? '',
          zip: config.landlordZip ?? '', neighborhood: config.landlordNeighborhood ?? '', cityState: config.landlordCityState ?? ''
        },
        brand: { logoUrl: companyData.contract_logo_url ?? '', primaryColor: config.primaryColor ?? '#174b78', accentColor: config.accentColor ?? '#f4cf2e' },
        customer: {
          name: customer.name ?? '', cpf: extraFields.customerCpf || customer.cpf, phone: customer.phone ?? '', rg: extraFields.customerRg || customer.rg,
          address: customer.address ?? '', zip: extraFields.customerZip || customer.zip, neighborhood: extraFields.customerNeighborhood || customer.neighborhood, cityState: extraFields.customerCityState || customer.city_state
        },
        customerName: customer.name ?? 'Cliente', customerPhone: customer.phone ?? '', customerAddress: customer.address ?? '',
        event: {
          date: rental.start_date, pickupDate: extraFields.pickupDate || rental.start_date,
          startTime: String(rental.start_time ?? '').slice(0,5), endTime: String(rental.end_time ?? '').slice(0,5),
          address: extraFields.eventAddress || rental.delivery_address || customer.address || '',
          neighborhood: extraFields.eventNeighborhood, cityState: extraFields.eventCityState
        },
        payment: { total, signal, signalPercent, dueDateText: extraFields.dueDateText || date(rental.start_date) + ', na entrega do equipamento' },
        startDate: rental.start_date, endDate: rental.end_date, totalAmount: total, rentalNumber: rental.rental_number,
        items: (rental.rental_items ?? []).map((item: any) => ({ name: item.products?.name ?? 'Brinquedo', quantity: item.quantity, dailyPrice: item.unit_price, subtotal: item.subtotal ?? Number(item.unit_price) * Number(item.quantity) })),
        depositAmount: rental.deposit_amount ?? 0, deliveryAddress: extraFields.eventAddress || rental.delivery_address || '',
        rentalNotes: rental.notes ?? '', signaturePlace: extraFields.signaturePlace || config.landlordCityState || '',
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
    printWindow.document.write(buildRentalContractHtml(contract.contract_snapshot ?? {}, contract.contract_number));
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
    <ContractBrandingSettings companyId={companyId} companyName={companyName} />
    <div className="marketing-editor">
      <h3>Novo contrato</h3>
      <label>Locação<select value={selectedRental} onChange={event => {
        const value=event.target.value; setSelectedRental(value);
        const rental=rentals.find(item=>item.id===value);
        setExtraFields(current=>({...current,pickupDate:rental?.start_date??'',eventAddress:rental?.delivery_address??rental?.customers?.address??'',customerCpf:rental?.customers?.cpf??'',customerRg:rental?.customers?.rg??'',customerZip:rental?.customers?.zip??'',customerNeighborhood:rental?.customers?.neighborhood??'',customerCityState:rental?.customers?.city_state??''}));
      }}><option value="">Selecione uma locação</option>{rentals.map(rental => <option key={rental.id} value={rental.id}>#{rental.rental_number} · {rental.customers?.name ?? 'Cliente'} · {date(rental.start_date)}</option>)}</select></label>
      <h4>Dados complementares deste contrato</h4>
      <div className="form-grid">
        <label>CPF do contratante<input value={extraFields.customerCpf} onChange={e=>setExtraFields(v=>({...v,customerCpf:e.target.value}))}/></label>
        <label>RG do contratante<input value={extraFields.customerRg} onChange={e=>setExtraFields(v=>({...v,customerRg:e.target.value}))}/></label>
        <label>CEP do contratante<input value={extraFields.customerZip} onChange={e=>setExtraFields(v=>({...v,customerZip:e.target.value}))}/></label>
        <label>Bairro do contratante<input value={extraFields.customerNeighborhood} onChange={e=>setExtraFields(v=>({...v,customerNeighborhood:e.target.value}))}/></label>
        <label>Cidade/UF do contratante<input value={extraFields.customerCityState} onChange={e=>setExtraFields(v=>({...v,customerCityState:e.target.value}))}/></label>
        <label>Data de retirada<input type="date" value={extraFields.pickupDate} onChange={e=>setExtraFields(v=>({...v,pickupDate:e.target.value}))}/></label>
        <label>Endereço do evento<input value={extraFields.eventAddress} onChange={e=>setExtraFields(v=>({...v,eventAddress:e.target.value}))}/></label>
        <label>Bairro do evento<input value={extraFields.eventNeighborhood} onChange={e=>setExtraFields(v=>({...v,eventNeighborhood:e.target.value}))}/></label>
        <label>Cidade/UF do evento<input value={extraFields.eventCityState} onChange={e=>setExtraFields(v=>({...v,eventCityState:e.target.value}))}/></label>
        <label>Vencimento do saldo<input value={extraFields.dueDateText} placeholder="Ex.: na entrega do equipamento" onChange={e=>setExtraFields(v=>({...v,dueDateText:e.target.value}))}/></label>
        <label>Local da assinatura<input value={extraFields.signaturePlace} onChange={e=>setExtraFields(v=>({...v,signaturePlace:e.target.value}))}/></label>
      </div>
      <label>Modalidade de assinatura<select value={method} onChange={event => setMethod(event.target.value as 'external' | 'in_app')}><option value="external">Gov.br ou outro serviço externo</option><option value="in_app">Assinar diretamente pelo KidsLoc</option></select></label>
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
