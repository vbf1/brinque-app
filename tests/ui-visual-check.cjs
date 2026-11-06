const { chromium } = require('playwright');
const fs = require('node:fs');

const baseUrl = process.env.KIDSLOC_BASE_URL || 'http://127.0.0.1:4173/kidsloc-app/';
const viewports = [
  { name: 'mobile-320', width: 320, height: 720 },
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 900 },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  let failures = 0;
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      });
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));

      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Entrar' }).waitFor({ state: 'visible', timeout: 15000 });

      const login = await page.evaluate(() => {
        const card = document.querySelector('.legacy-auth-card');
        const visible = element => !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
        const inputs = [...document.querySelectorAll('.legacy-auth-card input')].filter(visible);
        const cardRect = card?.getBoundingClientRect();
        const outside = inputs.filter(input => {
          const rect = input.getBoundingClientRect();
          return !cardRect || rect.left < cardRect.left - 1 || rect.right > cardRect.right + 1;
        }).length;
        return {
          viewport: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          cardVisible: !!card && visible(card),
          cardOutside: !cardRect || cardRect.left < 0 || cardRect.right > window.innerWidth + 1,
          inputOutside: outside,
          inputCount: inputs.length,
          logoImageVisible: !!document.querySelector('.legacy-auth-brand img'),
          wordmarkCentered: (() => { const wordmark = document.querySelector('.legacy-auth-wordmark'); if (!wordmark) return false; const rect = wordmark.getBoundingClientRect(); return Math.abs((rect.left + rect.width / 2) - window.innerWidth / 2) < 3; })(),
        };
      });

      await page.screenshot({ path: `artifacts/react-${viewport.name}.png`, fullPage: true });

      if (login.overflow || !login.cardVisible || login.cardOutside || login.inputOutside || login.logoImageVisible || !login.wordmarkCentered || pageErrors.length) {
        failures++;
        console.error(`FAIL ${viewport.name}: ${JSON.stringify({ ...login, pageErrors })}`);
      } else {
        console.log(`PASS ${viewport.name}: login adaptável, ${login.inputCount} campos dentro do cartão, sem overflow horizontal`);
      }

      await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
      const forgotVisible = await page.getByRole('heading', { name: 'Recuperar senha' }).isVisible();
      if (!forgotVisible) {
        failures++;
        console.error(`FAIL ${viewport.name}: fluxo de recuperação não abriu`);
      }
      await page.getByRole('button', { name: 'Voltar ao login' }).click();
      if (!(await page.getByRole('button', { name: 'Entrar' }).isVisible())) {
        failures++;
        console.error(`FAIL ${viewport.name}: não retornou ao login`);
      }
      await page.close();
    }

    // Exercise shared layout classes used by authenticated modules without requiring production credentials.
    const css = fs.readFileSync('apps/desktop_react/src/styles.css', 'utf8');
    const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
      <div class="legacy-app"><header class="legacy-header"><div class="legacy-headrow"><div class="legacy-brand"><strong>KidsLoc App</strong></div><div class="legacy-head-actions"><button>Menu</button></div></div></header>
      <main class="legacy-main"><section class="module-shell"><div class="module-header"><div><p class="eyebrow">GESTÃO</p><h2>Brinquedos e estoque</h2></div><button>Novo cadastro</button></div>
      <div class="module-toolbar"><input value="Pesquisa com um nome ou e-mail muito comprido para testar a largura"><button>Pesquisar</button></div>
      <div class="data-list"><article class="data-list-row"><div><strong>Nome de cadastro com descrição extensa</strong><span>email-muito-comprido-para-testar-quebra-de-layout@example.com</span></div><strong>R$ 999.999,99</strong><div class="data-row-actions"><button>Editar</button><button>Excluir</button></div></article></div>
      <div class="form-grid"><label>Nome<input value="Texto de teste"></label><label>E-mail<input value="usuario@example.com"></label></div>
      <div class="agenda-layout"><section class="agenda-calendar"><div class="agenda-month-heading"><button>‹</button><h3>Setembro de 2026</h3><button>›</button></div><div class="agenda-grid">${'<div class="agenda-day">15<small>12 reservas</small></div>'.repeat(7)}</div></section><aside class="agenda-day-panel">Reservas do dia</aside></div>
      <div class="stats-panels"><section class="stats-panel"><h3>Resumo estatístico</h3><p>Texto extenso para validar quebra e dimensionamento responsivo.</p></section></div>
      <div class="team-chat-layout"><aside class="team-chat-sidebar">Conversas</aside><section class="team-chat-panel"><div class="team-chat-message-list">Mensagem longa de teste para validar quebra automática em larguras reduzidas.</div></section></div>
      <section class="users-card"><div class="users-card-top"><div class="users-avatar">U</div><div class="users-primary"><strong>Usuário de teste</strong><span>email-muito-comprido-para-testar-quebra-de-layout@example.com</span></div><span class="users-role">Administrador</span></div></section>
      </section></main></div></body></html>`;
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
      await page.setContent(fixture, { waitUntil: 'domcontentloaded' });
      await page.addStyleTag({ content: css });
      const layout = await page.evaluate(() => {
        const rectProblems = [...document.querySelectorAll('.module-shell,.data-list-row,.agenda-layout,.team-chat-layout,.users-card')].filter(el => {
          const r = el.getBoundingClientRect(); return r.left < -1 || r.right > window.innerWidth + 1 || r.width > window.innerWidth + 1;
        }).map(el => el.className);
        const usersPrimaryWidth = document.querySelector('.users-primary')?.getBoundingClientRect().width ?? 0;
        return { viewport: window.innerWidth, documentWidth: document.documentElement.scrollWidth, overflow: document.documentElement.scrollWidth > window.innerWidth + 1, rectProblems, usersPrimaryWidth };
      });
      await page.screenshot({ path: `artifacts/modules-${viewport.name}.png`, fullPage: true });
      if (layout.overflow || layout.rectProblems.length || (viewport.width <= 340 && layout.usersPrimaryWidth < 145)) { failures++; console.error(`FAIL module-layout ${viewport.name}: ${JSON.stringify(layout)}`); }
      else console.log(`PASS module-layout ${viewport.name}: componentes compartilhados dentro da largura disponível`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  if (failures) process.exit(1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
