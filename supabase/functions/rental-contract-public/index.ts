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
function drawSignature(page: any, svg: string, fontColor: any) {
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
        start: { x: 70 + previous.x * 0.68, y: 185 - previous.y * 0.34 },
        end: { x: 70 + point.x * 0.68, y: 185 - point.y * 0.34 },
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
  const ink = rgb(0.10, 0.16, 0.14);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 800;
  const ensure = (height = 24) => { if (y < 65 + height) { page = pdf.addPage([595.28, 841.89]); y = 800; } };
  const line = (text: unknown, opts: {bold?:boolean;size?:number;indent?:number} = {}) => {
    const value = safeText(text, 1800);
    const size = opts.size ?? 10;
    const font = opts.bold ? bold : regular;
    const maxWidth = 500 - (opts.indent ?? 0);
    const words = value.split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? current + " " + word : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        ensure(size + 7); page.drawText(current, { x: 48 + (opts.indent ?? 0), y, size, font, color: ink }); y -= size + 6; current = word;
      } else current = candidate;
    }
    if (current) { ensure(size + 7); page.drawText(current, { x: 48 + (opts.indent ?? 0), y, size, font, color: ink }); y -= size + 7; }
  };
  line("CONTRATO DE LOCAÇÃO DE BRINQUEDOS", { bold: true, size: 16 });
  line("Contrato nº " + contractNumber + " · KidsLoc", { size: 10 });
  y -= 8;
  line("LOCADORA", { bold: true, size: 11 });
  line(snapshot.companyName);
  line("CLIENTE", { bold: true, size: 11 });
  line("Nome: " + snapshot.customerName);
  line("Telefone: " + (snapshot.customerPhone || "—"));
  line("Endereço: " + (snapshot.customerAddress || "—"));
  line("Período: " + snapshot.startDate + " até " + snapshot.endDate);
  line("Endereço de entrega: " + (snapshot.deliveryAddress || "—"));
  y -= 8; line("ITENS LOCADOS", { bold: true, size: 11 });
  for (const item of (Array.isArray(snapshot.items) ? snapshot.items.slice(0, 100) : [])) {
    line(String(item.quantity) + " × " + safeText(item.name, 120) + " · subtotal R$ " + Number(item.subtotal ?? 0).toFixed(2), { indent: 8 });
  }
  line("Valor total: R$ " + Number(snapshot.totalAmount ?? 0).toFixed(2), { bold: true });
  line("Caução/garantia: R$ " + Number(snapshot.depositAmount ?? 0).toFixed(2));
  if (snapshot.rentalNotes) line("Observações: " + snapshot.rentalNotes);
  y -= 8; line("CONDIÇÕES DO CONTRATO", { bold: true, size: 11 });
  const clauses = Array.isArray(snapshot.clauses) ? snapshot.clauses.slice(0, 30) : [];
  clauses.forEach((clause: unknown, index: number) => line((index + 1) + ". " + safeText(clause, 1200), { indent: 5 }));
  y -= 10; ensure(90); line("REGISTRO DA ASSINATURA ELETRÔNICA", { bold: true, size: 11 });
  line("Assinante: " + signer.name);
  line("Documento informado: " + (signer.document || "Não informado"));
  line("Telefone informado: " + (signer.phone || "Não informado"));
  line("Data e hora do aceite: " + signer.signedAt);
  line("Declaração: " + signer.consent);
  y -= 5; line("Assinatura manuscrita:", { bold: true });
  ensure(95);
  drawSignature(page, signatureSvg, ink);
  y = Math.min(y, 70);
  page.drawLine({ start: { x: 48, y: 58 }, end: { x: 330, y: 58 }, thickness: 0.7, color: ink });
  page.drawText(safeText(signer.name, 100), { x: 48, y: 43, size: 9, font: regular, color: ink });
  page.drawText("Registro eletrônico pelo KidsLoc", { x: 365, y: 43, size: 8, font: regular, color: ink });
  return await pdf.save();
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
      return json({ contract: contract.contract_snapshot, signature_method: contract.signature_method });
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
      const pdfBytes = await createSignedPdf(contract.contract_snapshot ?? {}, contract.contract_number, signer, signatureSvg);
      const path = contract.company_id + "/" + contract.id + "/contrato-assinado-kidsloc.pdf";
      const { error: uploadError } = await admin.storage.from("rental-contracts").upload(path, pdfBytes, {
        contentType: "application/pdf", upsert: true,
      });
      if (uploadError) return json({ error: "A assinatura foi validada, mas não foi possível salvar o PDF. Tente novamente." }, 500);
      const { data: updated, error: updateError } = await admin.from("rental_contracts").update({
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
