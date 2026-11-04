const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
  .map(match => match[1]).join('\n');

const fixture = `<!doctype html>
<html lang="pt-BR" style="--safe-area-inset-left:18px;--safe-area-inset-right:18px;--safe-area-inset-top:12px;--safe-area-inset-bottom:16px">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${styles}</style></head>
<body>
<div id="authGate"><div class="panel" style="width:min(430px,100%);margin:0">
  <b style="font-size:22px">KIDSLOC APP</b><p class="muted">Acesse sua empresa Sonho Kids Brinquedos</p>
  <label>E-mail</label><input type="email" placeholder="seuemail@exemplo.com">
  <label>Senha</label><input type="password" placeholder="Sua senha">
  <button class="full">Entrar</button>
</div></div>
<header><div class="headrow"><b>KIDSLOC APP</b><button class="menu-trigger" aria-label="Menu">☰</button></div></header>
<main>
<section><div class="section-title">Resumo do negócio</div><div class="grid">
  <div class="card"><div class="metric-label">Faturamento do mês</div><div class="metric">R$ 1.250,00</div></div>
  <div class="card"><div class="metric-label">Locações cadastradas</div><div class="metric">12</div></div>
</div></section>
<section id="config"><div class="section-title">Lembretes de eventos</div>
  <div class="panel reminder-settings-box">
    <div class="formgrid"><div><label>Avisar quantos dias antes?</label><select><option>3 dias</option></select></div>
    <div><label>Quantos avisos por dia?</label><select><option>2 avisos</option></select></div></div>
    <label>Nome da empresa</label><input placeholder="Digite o nome da sua empresa">
    <label>Observações</label><textarea placeholder="Digite suas observações"></textarea>
    <label><input type="checkbox"> Ativar lembretes</label>
    <label>Data do evento</label><input type="date">
    <label>Horário</label><input type="time">
    <label>Imagem</label><input type="file">
  </div>
</section>
<section><div class="panel"><div class="section-title">Formulário de cadastro</div>
  <div id="formBody"><div class="formgrid"><div><label>Nome completo</label><input placeholder="Nome"></div><div><label>E-mail</label><input type="email" placeholder="email@exemplo.com"></div></div>
  <label>Brinquedos</label><select><option>Selecione os brinquedos</option></select>
  <label>Detalhes adicionais</label><textarea placeholder="Detalhes"></textarea><button class="full">Salvar cadastro</button></div>
</div></section>
</main>
</body></html>`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: 'mobile-320', width: 320, height: 720 },
    { name: 'mobile-360', width: 360, height: 800 },
    { name: 'mobile-390', width: 390, height: 844 },
    { name: 'mobile-430', width: 430, height: 932 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'desktop-1280', width: 1280, height: 900 }
  ];
  let failures = 0;
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
      await page.setContent(fixture, { waitUntil: 'domcontentloaded' });
      const result = await page.evaluate(() => {
        const visible = element => !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
        const controls = [...document.querySelectorAll('main input:not([type=checkbox]),main select,main textarea')].filter(visible);
        const main = document.querySelector('main').getBoundingClientRect();
        const overflow = document.documentElement.scrollWidth > window.innerWidth;
        const outside = controls.filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.left < main.left - 0.5 || rect.right > main.right + 0.5;
        }).map(el => ({ tag: el.tagName, type: el.type || '', left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right) }));
        const auth = document.querySelector('#authGate .panel').getBoundingClientRect();
        const authControls = [...document.querySelectorAll('#authGate input')].filter(visible);
        const authOutside = authControls.some(el => {
          const rect = el.getBoundingClientRect();
          return rect.left < auth.left - 0.5 || rect.right > auth.right + 0.5;
        });
        return { viewport: window.innerWidth, documentWidth: document.documentElement.scrollWidth, overflow, outside, authOutside, controls: controls.length };
      });
      await page.screenshot({ path: `artifacts/${viewport.name}.png`, fullPage: true });
      if (result.overflow || result.outside.length || result.authOutside) {
        failures++;
        console.error(`FAIL ${viewport.name}: ${JSON.stringify(result)}`);
      } else {
        console.log(`PASS ${viewport.name}: ${result.controls} campos sem overflow horizontal`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  if (failures) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
