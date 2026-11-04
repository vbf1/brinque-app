import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type Snapshot = Record<string, any>;
export function PublicContractPage({ token }: { token: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [signed, setSigned] = useState(false);
  const points = useRef<Array<{x:number;y:number;start:boolean}>>([]);
  const drawing = useRef(false);

  useEffect(() => {
    let active = true;
    void supabase.functions.invoke('rental-contract-public', { body: { action: 'view', token } })
      .then(({data,error}) => {
        if (!active) return;
        if (error || !data?.contract) setMessage(data?.error ?? 'Não foi possível abrir este contrato. Verifique se o link ainda está válido.');
        else if (data.signature_method !== 'in_app') setMessage('Este contrato foi enviado para assinatura externa. Assine o PDF e devolva à empresa.');
        else setSnapshot(data.contract);
      }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  }
  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.setPointerCapture(event.pointerId); drawing.current = true;
    const p = point(event); points.current.push({...p,start:true});
    const ctx = canvas.getContext('2d')!; ctx.beginPath(); ctx.moveTo(p.x,p.y);
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !canvasRef.current) return;
    const p = point(event); points.current.push({...p,start:false});
    const ctx = canvasRef.current.getContext('2d')!; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#172b25'; ctx.lineTo(p.x,p.y); ctx.stroke();
  }
  function stop() { drawing.current = false; }
  function clear() { points.current=[]; const c=canvasRef.current; if(c) c.getContext('2d')!.clearRect(0,0,c.width,c.height); }
  function svg() {
    const d = points.current.map(p => (p.start ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="180" viewBox="0 0 640 180"><path d="' + d + '" fill="none" stroke="#172b25" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  async function sign() {
    if (name.trim().length < 3 || !consent || points.current.length < 3) { setMessage('Informe seu nome, desenhe sua assinatura e confirme a concordância.'); return; }
    setSaving(true); setMessage('');
    const consentText = 'Declaro que li integralmente o contrato e concordo com suas condições.';
    const {data,error} = await supabase.functions.invoke('rental-contract-public', {body:{
      action:'sign', token, signer_name:name.trim(), signer_document:document.trim(), signer_phone:phone.trim(),
      signature_svg:svg(), consent_text:consentText
    }});
    if (error || !data?.success) setMessage(data?.error ?? 'Não foi possível registrar a assinatura.');
    else setSigned(true);
    setSaving(false);
  }

  return <main style={{maxWidth:760,margin:'24px auto',padding:20,color:'#172b25',fontFamily:'Arial,sans-serif'}}>
    <h1>KidsLoc · Contrato de locação</h1>
    {loading ? <p>Carregando contrato...</p> : null}
    {snapshot && !signed && <><h2>{snapshot.companyName}</h2><p><b>Cliente:</b> {snapshot.customerName} · <b>Período:</b> {snapshot.startDate} a {snapshot.endDate}</p>
      <h3>Itens e valores</h3><ul>{(snapshot.items ?? []).map((i:any,n:number)=><li key={n}>{i.quantity} × {i.name} — R$ {Number(i.subtotal ?? 0).toFixed(2)}</li>)}</ul>
      <p><b>Total: R$ {Number(snapshot.totalAmount ?? 0).toFixed(2)}</b></p>
      <h3>Condições do contrato</h3><ol>
        <li>Utilize os brinquedos conforme as orientações fornecidas pela locadora e mantenha-os em boas condições.</li>
        <li>O contratante deverá supervisionar a utilização e impedir uso inadequado ou por pessoas não autorizadas.</li>
        <li>Danos, perdas ou avarias decorrentes de mau uso deverão ser comunicados e poderão gerar ressarcimento.</li>
        <li>Respeite o período contratado e as condições de devolução combinadas.</li>
        <li>Valores e condições de pagamento são os apresentados no resumo da locação.</li>
      </ol>
      <h3>Assinatura eletrônica</h3><label>Nome completo<input value={name} onChange={e=>setName(e.target.value)} style={field}/></label>
      <label>CPF (opcional)<input value={document} onChange={e=>setDocument(e.target.value)} style={field}/></label>
      <label>Telefone (opcional)<input value={phone} onChange={e=>setPhone(e.target.value)} style={field}/></label>
      <p>Assine no campo abaixo:</p><canvas ref={canvasRef} width={640} height={180} style={{width:'100%',height:180,border:'1px solid #aab5af',borderRadius:8,touchAction:'none',background:'#fff'}} onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}/>
      <button type="button" onClick={clear} style={buttonSecondary}>Limpar assinatura</button>
      <label style={{display:'flex',gap:10,alignItems:'flex-start',margin:'18px 0'}}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Declaro que li o contrato completo e concordo com suas condições.</label>
      <button type="button" disabled={saving} onClick={()=>void sign()} style={buttonPrimary}>{saving?'Registrando...':'Assinar contrato'}</button>
    </>}
    {signed && <h2>Contrato assinado com sucesso. Sua assinatura e os dados do aceite foram registrados no KidsLoc. A empresa poderá consultar o documento assinado.</h2>}
    {message && <p role="status" style={{padding:12,background:'#fff4df',borderRadius:8}}>{message}</p>}
  </main>;
}
const field: React.CSSProperties = {display:'block',width:'100%',padding:12,margin:'6px 0 14px',border:'1px solid #aab5af',borderRadius:8,boxSizing:'border-box'};
const buttonPrimary: React.CSSProperties = {padding:'12px 18px',border:0,borderRadius:8,background:'#185b43',color:'#fff',fontWeight:700};
const buttonSecondary: React.CSSProperties = {padding:'8px 12px',marginTop:8,border:'1px solid #aab5af',borderRadius:8,background:'#fff'};
