export type ContractSnapshot = Record<string, any>;

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const money = (value: unknown) => Number(value ?? 0).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
const date = (value: unknown) => {
  if (!value) return '____/____/________';
  const raw = String(value);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(raw + 'T12:00:00') : new Date(raw);
  return Number.isNaN(parsed.getTime()) ? esc(raw) : parsed.toLocaleDateString('pt-BR');
};
const line = (label: string, value: unknown) => '<div class="field"><b>' + label + ':</b> ' + (String(value ?? '').trim() ? esc(value) : '________________________________') + '</div>';

export function buildRentalContractHtml(snapshot: ContractSnapshot, number?: number) {
  const landlord = snapshot.landlord ?? {};
  const customer = snapshot.customer ?? {};
  const event = snapshot.event ?? {};
  const payment = snapshot.payment ?? {};
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const brand = snapshot.brand ?? {};
  const primary = /^#[0-9a-f]{6}$/i.test(brand.primaryColor ?? '') ? brand.primaryColor : '#174b78';
  const accent = /^#[0-9a-f]{6}$/i.test(brand.accentColor ?? '') ? brand.accentColor : '#f4cf2e';
  const logo = typeof brand.logoUrl === 'string' && /^https:\/\//i.test(brand.logoUrl) ? '<img class="logo" src="' + esc(brand.logoUrl) + '" alt="Logo da empresa">' : '';
  const total = Number(payment.total ?? snapshot.totalAmount ?? 0);
  const signal = Number(payment.signal ?? total * 0.3);
  const retention = total * 0.15;
  const refund = Math.max(0, signal - retention);
  const intro = 'O LOCADOR, identificado acima como pessoa física, utiliza o nome comercial ' +
    (landlord.commercialName || snapshot.companyName || '________________________________') +
    ' para identificar suas atividades de locação. As partes celebram o presente contrato, que será regido pelas cláusulas e condições a seguir.';
  const clauses = [
    ['CLÁUSULA 1ª – DO OBJETO', 'O LOCADOR realizará a locação dos seguintes equipamentos para utilização no evento:', '<ul class="items">' + items.map((item:any) => '<li>' + esc(item.quantity) + ' × ' + esc(item.name) + '</li>').join('') + '</ul>', 'Os equipamentos serão disponibilizados ao CONTRATANTE durante o período e nas condições estabelecidas neste instrumento.'],
    ['CLÁUSULA 2ª – DA DATA E DO LOCAL DO EVENTO',
      'Data do evento: ' + date(event.date) + ' &nbsp;&nbsp; Retirada dos equipamentos: ' + date(event.pickupDate) +
      '<br>Horário de início: ' + (event.startTime ? esc(event.startTime) : '__________') + ' &nbsp;&nbsp; Horário de término: ' + (event.endTime ? esc(event.endTime) : '__________') +
      '<br>Endereço de entrega: ' + esc(event.address || '____________________________________________') +
      '<br>Bairro: ' + esc(event.neighborhood || '________________________') + '<br>Cidade/UF: ' + esc(event.cityState || '________________________')],
    ['CLÁUSULA 3ª – DO VALOR E DO PAGAMENTO',
      'Valor total da locação: ' + money(total) +
      '<br>Sinal de ' + esc(payment.signalPercent ?? 30) + '% para reserva: ' + money(signal) + ', a ser descontado do valor total.' +
      '<br>Saldo restante: ' + money(Math.max(0,total-signal)) +
      '<br>Vencimento do saldo: ' + esc(payment.dueDateText || '________________________________') +
      '<br>A reserva será confirmada após a identificação do pagamento do sinal. O valor pago como sinal integra o preço total da locação e será abatido do saldo, não sendo cobrado em duplicidade.'],
    ['CLÁUSULA 4ª – DA MONTAGEM E DA UTILIZAÇÃO',
      'O LOCADOR será responsável pela entrega, montagem e retirada dos equipamentos, conforme o serviço contratado. O CONTRATANTE deverá disponibilizar espaço adequado e seguro para a instalação. Os equipamentos deverão ser utilizados de forma adequada, observando-se as orientações de segurança fornecidas pelo LOCADOR.'],
    ['CLÁUSULA 5ª – DAS RESPONSABILIDADES',
      'O CONTRATANTE deverá zelar pelos equipamentos durante o período da locação e comunicar imediatamente ao LOCADOR qualquer ocorrência ou dano. Danos comprovadamente causados por uso inadequado, negligência ou descumprimento das orientações de segurança serão avaliados, cabendo ao responsável arcar com os prejuízos efetivamente comprovados, respeitada a legislação aplicável. O LOCADOR deverá entregar os equipamentos em condições adequadas de funcionamento e segurança.'],
    ['CLÁUSULA 6ª – DO CANCELAMENTO E DA ALTERAÇÃO DE DATA',
      'Em caso de desistência por parte do CONTRATANTE, comunicada com antecedência de até 2 (dois) dias corridos da data do evento, será retido o equivalente a 15% (quinze por cento) do valor total da locação, correspondente a ' + money(retention) +
      ' neste contrato. Esse valor equivale a 50% (cinquenta por cento) do sinal pago (' + money(signal) +
      '), sendo os outros ' + money(refund) +
      ' devolvidos ao CONTRATANTE. Nos demais casos de cancelamento ou em solicitações de alteração da data, as partes buscarão uma solução de comum acordo, observando a legislação aplicável e os direitos do consumidor.'],
    ['CLÁUSULA 7ª – DAS DISPOSIÇÕES GERAIS',
      'Qualquer alteração nas condições deste contrato deverá ser acordada entre as partes, preferencialmente por escrito. Este instrumento registra as condições ajustadas para a locação e produzirá efeitos após a aceitação pelas partes.'],
    ['CLÁUSULA 8ª – DA ASSINATURA',
      'As partes reconhecem a validade das assinaturas realizadas fisicamente ou por meio eletrônico, desde que seja possível identificar os signatários e verificar a integridade do documento. Estando de acordo com todas as condições, as partes assinam o presente instrumento.']
  ];
  const clause = (entry:string[]) => '<section class="clause"><h3>' + entry[0] + '</h3><p>' + entry.slice(1).join(' ') + '</p></section>';
  const landlordBlock = '<h3 class="section-label">LOCADOR – PESSOA FÍSICA</h3><div class="grid">' +
    line('Nome',landlord.name) + line('CPF',landlord.cpf) + line('Telefone/WhatsApp',landlord.phone) + line('Nome comercial',landlord.commercialName || snapshot.companyName) +
    line('Endereço',landlord.address) + line('CEP',landlord.zip) + line('Bairro',landlord.neighborhood) + line('Cidade/UF',landlord.cityState) + '</div>';
  const customerBlock = '<h3 class="section-label yellow">CONTRATANTE</h3><div class="grid yellow-grid">' +
    line('Nome',customer.name || snapshot.customerName) + line('CPF',customer.cpf) + line('Telefone/WhatsApp',customer.phone || snapshot.customerPhone) + line('RG',customer.rg) +
    line('Endereço',customer.address || snapshot.customerAddress) + line('CEP',customer.zip) + line('Bairro',customer.neighborhood) + line('Cidade/UF',customer.cityState) + '</div>';
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Contrato de Locação ' + esc(number ?? '') + '</title><style>' +
    '@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font:10px Arial,sans-serif;color:#24313d;background:#fff}.page{width:210mm;min-height:297mm;padding:18mm 21mm 17mm;position:relative;page-break-after:always}.page:last-child{page-break-after:auto}.topbar{height:5mm;position:absolute;left:0;right:0;top:0;background:linear-gradient(90deg,#18a1c4 0 25%,#ffd52f 25% 50%,#e83e50 50% 70%,#d92f91 70% 88%,#62b331 88%)}.head{display:flex;align-items:center;gap:16px;border-bottom:4px solid var(--accent);padding:7mm 0 3mm;margin-bottom:8mm}.logo{width:48mm;height:27mm;object-fit:contain}.title{flex:1;text-align:center;color:var(--primary)}h1{font-size:17px;line-height:1.12;margin:0 0 3px;font-weight:800} .subtitle{font-size:9px;color:#77828e}.section-label{font-size:11px;color:var(--primary);margin:7px 0 3px;font-weight:bold}.section-label.yellow{color:var(--primary)}.grid{display:grid;grid-template-columns:1.2fr 1fr;background:#eaf5fb;border:1px solid #d1e1ea;margin-bottom:5px}.field{padding:4px 6px;border:1px solid #d4e0e6;min-height:22px;font-size:9px}.yellow-grid{background:#fffbe1}.yellow-grid .field{border-color:#eee8c5}.clause{margin:5px 0}.clause h3{font-size:10px;color:var(--primary);margin:4px 0 2px}.clause p{font-size:9px;line-height:1.25;margin:0}.clause ul{margin:2px 0 3px;padding-left:16px}.items li{margin:1px 0}.page-heading{text-align:center;color:var(--primary);font-size:17px;margin:2mm 0 2mm}.page-sub{text-align:center;color:#77828e;font-size:9px;border-bottom:4px solid var(--accent);padding-bottom:5mm;margin-bottom:7mm}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:24mm;margin:20mm 0 10mm;text-align:center}.signature-line{border-top:1px solid #344b5b;padding-top:8px;font-size:9px;min-height:27mm}.witness{width:100%;border-collapse:collapse;margin-top:9mm}.witness td,.witness th{border:1px solid #d4e0e6;padding:8px;text-align:left}.witness th{background:#fffbe1}.local-date{background:#eaf5fb;border:1px solid #d1e1ea;padding:10px;display:flex;justify-content:space-between;margin-top:6mm}.footer{position:absolute;bottom:7mm;left:21mm;right:21mm;border-top:1px solid #d7dfe4;padding-top:3mm;color:#7d8790;font-size:8px;display:flex;justify-content:space-between}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{margin:0;box-shadow:none}}' +
    '</style></head><body style="--primary:' + primary + ';--accent:' + accent + '">' +
    '<div class="page"><div class="topbar"></div><header class="head">' + logo + '<div class="title"><h1>CONTRATO DE LOCAÇÃO DE<br>BRINQUEDOS E EQUIPAMENTOS</h1><div class="subtitle">' + esc(landlord.commercialName || snapshot.companyName || 'NOME COMERCIAL') + '</div></div></header>' +
    landlordBlock + customerBlock + '<p>' + esc(intro) + '</p>' +
    clauses.slice(0,4).map(clause).join('') +
    '<div class="footer"><span>' + esc(landlord.commercialName || snapshot.companyName || 'CONTRATO DE LOCAÇÃO') + ' • CONTRATO DE LOCAÇÃO</span><span>Página 1</span></div></div>' +
    '<div class="page"><div class="topbar"></div><h2 class="page-heading">CONDIÇÕES GERAIS E ASSINATURAS</h2><div class="page-sub">' + esc(landlord.commercialName || snapshot.companyName || '') + '</div>' +
    clauses.slice(4).map(clause).join('') +
    '<div class="local-date"><span>Local: ' + esc(snapshot.signaturePlace || landlord.cityState || '________________________') + '</span><span>Data da assinatura: ' + date(snapshot.signatureDate) + '</span></div>' +
    '<div class="signatures"><div class="signature-line">' + esc(landlord.name || '________________________________') + '<br><br>LOCADOR – PESSOA FÍSICA<br><br>Assinatura</div><div class="signature-line">' + esc(customer.name || snapshot.customerName || '________________________________') + '<br><br>CONTRATANTE<br><br>Assinatura</div></div>' +
    '<table class="witness"><tr><th>TESTEMUNHA 1</th><th>TESTEMUNHA 2</th></tr><tr><td>Nome: ____________________________________</td><td>Nome: ____________________________________</td></tr><tr><td>CPF: _____________________________________</td><td>CPF: _____________________________________</td></tr><tr><td>Assinatura: _______________________________</td><td>Assinatura: _______________________________</td></tr></table>' +
    '<div class="footer"><span>' + esc(landlord.commercialName || snapshot.companyName || 'CONTRATO DE LOCAÇÃO') + ' • CONTRATO DE LOCAÇÃO</span><span>Página 2</span></div></div></body></html>';
}
