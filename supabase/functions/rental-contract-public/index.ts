import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeText(value: unknown, max = 500) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[·×—–]/g, "-").slice(0, max);
}
function drawSignature(page: any, svg: string, fontColor: any, originX = 70, originY = 185) {
  if (!/^<svg[^>]*><path d="(?:[MLml0-9.\s-]+)"[^>]*\/?><\/svg>$/.test(svg)) {
    throw new Error("Formato de assinatura inválido.");
  }
  const d = svg.match(/ d="([^"]+)"/)?.[1] ?? "";
  const tokens = [...d.matchAll(/([ML])\s*([0-9.]+)\s+([0-9.]+)/g)];
  if (tokens.length < 2 || tokens.length > 2500) throw new Error("Traçado de assinatura inválido.");
  let previous: {x:number;y:number} | null = null;
  for (const token of tokens) {
    const point = { x: Number(token[2]), y: Number(token[3]) };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 640 || point.y < 0 || point.y > 180) {
      throw new Error("Coordenadas de assinatura inválidas.");
    }
    if (token[1] === "M" || !previous) previous = point;
    else {
      page.drawLine({
        start: { x: originX + previous.x * 0.38, y: originY - previous.y * 0.28 },
        end: { x: originX + point.x * 0.38, y: originY - point.y * 0.28 },
        thickness: 1.8, color: fontColor,
      });
      previous = point;
    }
  }
}
async function createSignedPdf(snapshot: Record<string, any>, contractNumber: number, signer: Record<string, any>, signatureSvg: string) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.14, 0.19, 0.24);
  const primary = hexColor(snapshot.brand?.primaryColor, [0.09,0.29,0.47]);
  const accent = hexColor(snapshot.brand?.accentColor, [0.96,0.81,0.18]);
  const landlord = snapshot.landlord ?? {};
  const customer = snapshot.customer ?? {};
  const event = snapshot.event ?? {};
  const payment = snapshot.payment ?? {};
  const items = Array.isArray(snapshot.items) ? snapshot.items.slice(0, 40) : [];
  const total = Number(payment.total ?? snapshot.totalAmount ?? 0);
  const signal = Number(payment.signal ?? total * 0.3);
  const signalPercent = Number(payment.signalPercent ?? 30);
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dateBr = (v: unknown) => {
    const raw = String(v ?? "");
    if (!raw) return "____/____/________";
    const parsed = /^\\d{4}-\\d{2}-\\d{2}$/.test(raw) ? new Date(raw + "T12:00:00") : new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString("pt-BR");
  };
  const pdfPage = () => pdf.addPage([595.28, 841.89]);
  let page = pdfPage();
  let y = 790;
  const stripe = (p: any) => {
    const colors = [[0.09,0.63,0.77],[1,0.83,0.18],[0.91,0.22,0.31],[0.84,0.18,0.56],[0.38,0.70,0.19]];
    let x=0;
    const widths=[119,119,119,119,119];
    colors.forEach((c,i)=>{p.drawRectangle({x,y:829,width:widths[i],height:12,color:rgb(c[0],c[1],c[2])});x+=widths[i];});
  };
  const ensure = (height=18) => { if (y < 55 + height) { page=pdfPage(); stripe(page); y=790; } };
  const draw = (value: unknown, opts: {bold?:boolean;size?:number;indent?:number;color?:any}={}) => {
    const text = safeText(value,1800);
    const size=opts.size??9;
    const font=opts.bold?bold:regular;
    const max=500-(opts.indent??0);
    const words=text.split(/\\s+/);
    let current="";
    for(const word of words){
      const candidate=current?current+" "+word:word;
      if(font.widthOfTextAtSize(candidate,size)>max && current){
        ensure(size+7);
        page.drawText(current,{x:48+(opts.indent??0),y,size,font,color:opts.color??ink});
        y-=size+5; current=word;
      }else current=candidate;
    }
    if(current){ensure(size+7);page.drawText(current,{x:48+(opts.indent??0),y,size,font,color:opts.color??ink});y-=size+6;}
  };
  const heading = (value: string) => { y-=3; draw(value,{bold:true,size:10,color:primary}); };
  const field = (label: string,value: unknown) => draw(label+": "+(String(value??"").trim()||"________________________________"),{size:8.5,indent:4});
  stripe(page);
  try {
    const logoUrl = snapshot.brand?.logoUrl;
    if (typeof logoUrl==="string" && /^https:\\/\\//i.test(logoUrl)) {
      const response=await fetch(logoUrl);
      if(response.ok){
        const bytes=new Uint8Array(await response.arrayBuffer());
        const type=response.headers.get("content-type")??"";
        const img=type.includes("png")?await pdf.embedPng(bytes):type.includes("jpeg")||type.includes("jpg")?await pdf.embedJpg(bytes):null;
        if(img){const dims=img.scale(Math.min(105/img.width,58/img.height));page.drawImage(img,{x:48,y:748,width:dims.width,height:dims.height});}
      }
    }
  } catch { /* SVG and unsupported logo formats are omitted from the signed PDF. */ }
  page.drawText("CONTRATO DE LOCAÇÃO DE",{x:180,y:790,size:14,font:bold,color:primary});
  page.drawText("BRINQUEDOS E EQUIPAMENTOS",{x:180,y:771,size:14,font:bold,color:primary});
  page.drawText(safeText(landlord.commercialName||snapshot.companyName,100),{x:180,y:754,size:8,font:regular,color:ink});
  page.drawLine({start:{x:48,y:738},end:{x:547,y:738},thickness:3,color:accent});
  y=720;
  heading("LOCADOR - PESSOA FÍSICA");
  field("Nome",landlord.name);field("CPF",landlord.cpf);field("Telefone/WhatsApp",landlord.phone);field("Nome comercial",landlord.commercialName||snapshot.companyName);
  field("Endereço",landlord.address);field("CEP",landlord.zip);field("Bairro",landlord.neighborhood);field("Cidade/UF",landlord.cityState);
  heading("CONTRATANTE");
  field("Nome",customer.name||snapshot.customerName);field("CPF",customer.cpf);field("Telefone/WhatsApp",customer.phone||snapshot.customerPhone);field("RG",customer.rg);
  field("Endereço",customer.address||snapshot.customerAddress);field("CEP",customer.zip);field("Bairro",customer.neighborhood);field("Cidade/UF",customer.cityState);
  draw("O LOCADOR, identificado acima como pessoa física, utiliza o nome comercial "+(landlord.commercialName||snapshot.companyName)+" para identificar suas atividades de locação. As partes celebram o presente contrato, que será regido pelas cláusulas e condições a seguir.",{size:8.2});
  heading("CLÁUSULA 1ª - DO OBJETO");
  draw("O LOCADOR realizará a locação dos seguintes equipamentos para utilização no evento:",{size:8.2});
  items.forEach((item:any)=>draw("- "+String(item.quantity)+" x "+safeText(item.name,120),{size:8.2,indent:8}));
  draw("Os equipamentos serão disponibilizados ao CONTRATANTE durante o período e nas condições estabelecidas neste instrumento.",{size:8.2});
  heading("CLÁUSULA 2ª - DA DATA E DO LOCAL DO EVENTO");
  draw("Data do evento: "+dateBr(event.date)+"    Retirada dos equipamentos: "+dateBr(event.pickupDate),{size:8.2});
  draw("Horário de início: "+(event.startTime||"__________")+"    Horário de término: "+(event.endTime||"__________"),{size:8.2});
  draw("Endereço de entrega: "+(event.address||"____________________________________________"),{size:8.2});
  draw("Bairro: "+(event.neighborhood||"________________________")+"    Cidade/UF: "+(event.cityState||"________________________"),{size:8.2});
  heading("CLÁUSULA 3ª - DO VALOR E DO PAGAMENTO");
  draw("Valor total da locação: "+brl(total),{size:8.2});
  draw("Sinal de "+signalPercent+"% para reserva: "+brl(signal)+", a ser descontado do valor total.",{size:8.2});
  draw("Saldo restante: "+brl(Math.max(0,total-signal)),{size:8.2});
  draw("Vencimento do saldo: "+(payment.dueDateText||"________________________________"),{size:8.2});
  draw("A reserva será confirmada após a identificação do pagamento do sinal. O valor pago como sinal integra o preço total da locação e será abatido do saldo, não sendo cobrado em duplicidade.",{size:8.2});
  heading("CLÁUSULA 4ª - DA MONTAGEM E DA UTILIZAÇÃO");
  draw("O LOCADOR será responsável pela entrega, montagem e retirada dos equipamentos, conforme o serviço contratado. O CONTRATANTE deverá disponibilizar espaço adequado e seguro para a instalação. Os equipamentos deverão ser utilizados de forma adequada, observando-se as orientações de segurança fornecidas pelo LOCADOR.",{size:8.2});
  page=pdfPage();stripe(page);y=790;
  page.drawText("CONDIÇÕES GERAIS E ASSINATURAS",{x:90,y,size:15,font:bold,color:primary});
  page.drawLine({start:{x:48,y:770},end:{x:547,y:770},thickness:3,color:accent});y=748;
  heading("CLÁUSULA 5ª - DAS RESPONSABILIDADES");
  draw("O CONTRATANTE deverá zelar pelos equipamentos durante o período da locação e comunicar imediatamente ao LOCADOR qualquer ocorrência ou dano. Danos comprovadamente causados por uso inadequado, negligência ou descumprimento das orientações de segurança serão avaliados, cabendo ao responsável arcar com os prejuízos efetivamente comprovados, respeitada a legislação aplicável. O LOCADOR deverá entregar os equipamentos em condições adequadas de funcionamento e segurança.",{size:8.2});
  heading("CLÁUSULA 6ª - DO CANCELAMENTO E DA ALTERAÇÃO DE DATA");
  const retention=total*0.15; const refund=Math.max(0,signal-retention);
  draw("Em caso de desistência por parte do CONTRATANTE, comunicada com antecedência de até 2 (dois) dias corridos da data do evento, será retido o equivalente a 15% (quinze por cento) do valor total da locação, correspondente a "+brl(retention)+" neste contrato. Esse valor equivale a 50% (cinquenta por cento) do sinal pago ("+brl(signal)+"), sendo os outros "+brl(refund)+" devolvidos ao CONTRATANTE. Nos demais casos de cancelamento ou em solicitações de alteração da data, as partes buscarão uma solução de comum acordo, observando a legislação aplicável e os direitos do consumidor.",{size:8.2});
  heading("CLÁUSULA 7ª - DAS DISPOSIÇÕES GERAIS");
  draw("Qualquer alteração nas condições deste contrato deverá ser acordada entre as partes, preferencialmente por escrito. Este instrumento registra as condições ajustadas para a locação e produzirá efeitos após a aceitação pelas partes.",{size:8.2});
  heading("CLÁUSULA 8ª - DA ASSINATURA");
  draw("As partes reconhecem a validade das assinaturas realizadas fisicamente ou por meio eletrônico, desde que seja possível identificar os signatários e verificar a integridade do documento. Estando de acordo com todas as condições, as partes assinam o presente instrumento.",{size:8.2});
  y-=8;
  page.drawRectangle({x:48,y:y-28,width:499,height:30,color:rgb(0.91,0.96,0.98),borderColor:rgb(0.80,0.87,0.90),borderWidth:0.7});
  page.drawText("Local: "+safeText(snapshot.signaturePlace||landlord.cityState||"____________________",80),{x:58,y:y-17,size:8,font:regular,color:ink});
  page.drawText("Data da assinatura: "+dateBr(snapshot.signatureDate||signer.signedAt),{x:320,y:y-17,size:8,font:regular,color:ink});
  y-=78;
  page.drawLine({start:{x:48,y},end:{x:265,y},thickness:0.7,color:ink});
  page.drawLine({start:{x:330,y},end:{x:547,y},thickness:0.7,color:ink});
  page.drawText(safeText(landlord.name||"________________________________",100),{x:48,y:y-14,size:8,font:regular,color:ink});
  page.drawText(safeText(customer.name||snapshot.customerName||signer.name,100),{x:330,y:y-14,size:8,font:regular,color:ink});
  page.drawText("LOCADOR - PESSOA FÍSICA",{x:48,y:y-28,size:8,font:regular,color:ink});
  page.drawText("CONTRATANTE",{x:330,y:y-28,size:8,font:regular,color:ink});
  page.drawText("Assinatura",{x:48,y:y-42,size:8,font:regular,color:ink});
  page.drawText("Assinatura eletrônica",{x:330,y:y-42,size:8,font:regular,color:ink});
  drawSignature(page,signatureSvg,ink,330,y+30);
  const wy=y-82;
  page.drawRectangle({x:48,y:wy-65,width:499,height:72,borderColor:rgb(0.82,0.87,0.90),borderWidth:0.7});
  page.drawRectangle({x:48,y:wy-17,width:499,height:24,color:rgb(1,0.98,0.88)});
  page.drawLine({start:{x:297,y:wy-65},end:{x:297,y:wy+7},thickness:0.7,color:rgb(0.82,0.87,0.90)});
  page.drawText("TESTEMUNHA 1",{x:56,y:wy-2,size:8,font:bold,color:ink});
  page.drawText("TESTEMUNHA 2",{x:305,y:wy-2,size:8,font:bold,color:ink});
  page.drawText("Nome: __________________________",{x:56,y:wy-31,size:8,font:regular,color:ink});
  page.drawText("Nome: __________________________",{x:305,y:wy-31,size:8,font:regular,color:ink});
  page.drawText("CPF: ___________________________",{x:56,y:wy-48,size:8,font:regular,color:ink});
  page.drawText("CPF: ___________________________",{x:305,y:wy-48,size:8,font:regular,color:ink});
  page.drawText("Assinatura: _____________________",{x:56,y:wy-62,size:7.5,font:regular,color:ink});
  page.drawText("Assinatura: _____________________",{x:305,y:wy-62,size:7.5,font:regular,color:ink});
  pdf.getPages().forEach((p,i)=>{
    p.drawText(safeText(landlord.commercialName||snapshot.companyName,100)+" - CONTRATO DE LOCAÇÃO",{x:48,y:25,size:7,font:regular,color:rgb(0.48,0.52,0.56)});
    p.drawText("Página "+(i+1),{x:500,y:25,size:7,font:regular,color:rgb(0.48,0.52,0.56)});
  });
  return await pdf.save();
}
function hexColor(value: unknown, fallback: [number,number,number]) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value??""));
  if(!match)return rgb(fallback[0],fallback[1],fallback[2]);
  const n=parseInt(match[1],16);
  return rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Serviço indisponível." }, 500);
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const body = await req.json();
    const token = typeof body.token === "string" ? body.token : "";
    if (token.length < 40 || token.length > 200) return json({ error: "Link inválido ou incompleto." }, 400);
    const tokenHash = await sha256(token);
    const { data: contract, error } = await admin.from("rental_contracts")
      .select("id, company_id, contract_number, status, signature_method, contract_snapshot, token_expires_at, viewed_at")
      .eq("token_hash", tokenHash).maybeSingle();
    if (error || !contract) return json({ error: "Este link não é válido." }, 404);
    if (["cancelled", "expired", "signed"].includes(contract.status)) {
      return json({ error: contract.status === "signed" ? "Este contrato já foi assinado." : "Este contrato não está mais disponível." }, 410);
    }
    if (contract.token_expires_at && new Date(contract.token_expires_at).getTime() < Date.now()) {
      await admin.from("rental_contracts").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", contract.id);
      return json({ error: "O prazo deste link expirou. Solicite um novo contrato à empresa." }, 410);
    }
    if (body.action === "view") {
      if (!["sent", "viewed"].includes(contract.status)) {
        return json({ error: "Este contrato ainda não foi enviado pela empresa." }, 409);
      }
      await admin.from("rental_contracts").update({
        status: contract.status === "sent" ? "viewed" : contract.status,
        viewed_at: contract.viewed_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", contract.id);
      return json({ contract: { ...(contract.contract_snapshot ?? {}), contractNumber: contract.contract_number }, signature_method: contract.signature_method });
    }
    if (body.action === "sign") {
      if (contract.signature_method !== "in_app") return json({ error: "Este contrato deve ser assinado externamente e devolvido à empresa." }, 403);
      if (!["sent", "viewed"].includes(contract.status)) return json({ error: "Este contrato não pode mais ser assinado." }, 409);
      const signerName = safeText(body.signer_name, 180).trim();
      const signerDocument = safeText(body.signer_document, 40).trim();
      const signerPhone = safeText(body.signer_phone, 40).trim();
      const signatureSvg = typeof body.signature_svg === "string" ? body.signature_svg : "";
      const consent = safeText(body.consent_text, 180).trim();
      const requiredConsent = "Declaro que li integralmente o contrato e concordo com suas condições.";
      if (signerName.length < 3 || signatureSvg.length < 20 || signatureSvg.length > 50000 || consent !== requiredConsent) {
        return json({ error: "Informe seu nome, assine no campo e confirme a concordância." }, 400);
      }
      const signedAt = new Date().toISOString();
      const signer = { name: signerName, document: signerDocument, phone: signerPhone, consent, signedAt };
      const signedSnapshot = { ...(contract.contract_snapshot ?? {}), signatureDate: signedAt };
      const pdfBytes = await createSignedPdf(signedSnapshot, contract.contract_number, signer, signatureSvg);
      const path = contract.company_id + "/" + contract.id + "/contrato-assinado-kidsloc.pdf";
      const { error: uploadError } = await admin.storage.from("rental-contracts").upload(path, pdfBytes, {
        contentType: "application/pdf", upsert: true,
      });
      if (uploadError) return json({ error: "A assinatura foi validada, mas não foi possível salvar o PDF. Tente novamente." }, 500);
      const { data: updated, error: updateError } = await admin.from("rental_contracts").update({
        contract_snapshot: signedSnapshot,
        status: "signed", signed_at: signedAt, signer_name: signerName, signer_document: signerDocument || null,
        signer_phone: signerPhone || null, signature_svg: signatureSvg, consent_text: consent,
        signer_ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        signer_user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
        signed_pdf_path: path, updated_at: signedAt,
      }).eq("id", contract.id).in("status", ["sent", "viewed"]).select("id, signed_at, signed_pdf_path").maybeSingle();
      if (updateError || !updated) {
        await admin.storage.from("rental-contracts").remove([path]);
        return json({ error: "Não foi possível concluir a assinatura. Atualize a página e tente novamente." }, 409);
      }
      return json({ success: true, signed_at: updated.signed_at });
    }
    return json({ error: "Ação inválida." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Não foi possível processar a solicitação." }, 400);
  }
});
