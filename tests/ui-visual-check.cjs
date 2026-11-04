const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
// Executa o HTML real, mas remove os scripts para não autenticar nem acessar serviços externos.
const appHtml = source
  .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
  .replace(/<script\b[^>]*\/\s*>/gi, '')
  .replace('<html lang="pt-BR">', '<html lang="pt-BR" style="--safe-area-inset-left:18px;--safe-area-inset-right:18px;--safe-area-inset-top:12px;--safe-area-inset-bottom:16px">');

const viewports = [
  { name: 'mobile-320', width: 320, height: 720 },
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 900 }
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  let failures = 0;
  let checkedScreens = 0;
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1
      });
      await page.setContent(appHtml, { waitUntil: 'domcontentloaded' });

      const screens = await page.evaluate(() =>
        [...document.querySelectorAll('main > section')].map(section => ({
          id: section.id || 'home',
          hasContent: !!section.querySelector('input,select,textarea,button,.card,.record-card')
        }))
      );

      for (const screen of screens) {
        const result = await page.evaluate((screenId) => {
          const main = document.querySelector('main');
          const sections = [...main.querySelectorAll(':scope > section')];
          sections.forEach(section => {
            section.classList.toggle('hidden', (section.id || 'home') !== screenId);
          });
          document.querySelector('#authGate')?.remove();
          const active = sections.find(section => (section.id || 'home') === screenId);
          if (!active) return { error: 'Tela não encontrada: ' + screenId };

          const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
          const controls = [...active.querySelectorAll('input:not([type=checkbox]):not([type=radio]),select,textarea,button')]
            .filter(visible);
          const mainRect = main.getBoundingClientRect();
          const outside = controls.filter(el => {
            const r = el.getBoundingClientRect();
            return r.left < mainRect.left - 0.5 || r.right > mainRect.right + 0.5;
          }).map(el => ({
            tag: el.tagName, type: el.type || '', id: el.id || '',
            left: Math.round(el.getBoundingClientRect().left),
            right: Math.round(el.getBoundingClientRect().right)
          }));
          const panels = [...active.querySelectorAll('.panel')].filter(visible);
          const panelOverflow = panels.filter(panel => panel.scrollWidth > panel.clientWidth + 1)
            .map(panel => panel.id || panel.className);
          return {
            screen: screenId,
            viewport: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            overflow: document.documentElement.scrollWidth > window.innerWidth,
            outside,
            panelOverflow,
            controls: controls.length
          };
        }, screen.id);

        if (result.error) {
          failures++;
          console.error('FAIL ' + viewport.name + '/' + screen.id + ': ' + result.error);
          continue;
        }
        if (!screen.hasContent) continue;
        checkedScreens++;
        const screenshotName = screen.id.replace(/[^a-z0-9_-]/gi, '-') || 'home';
        await page.screenshot({
          path: 'artifacts/' + viewport.name + '-' + screenshotName + '.png',
          fullPage: true
        });
        if (result.overflow || result.outside.length || result.panelOverflow.length) {
          failures++;
          console.error('FAIL ' + viewport.name + '/' + screen.id + ': ' + JSON.stringify(result));
        } else {
          console.log('PASS ' + viewport.name + '/' + screen.id + ': ' + result.controls + ' controles dentro da área útil');
        }
      }

      // Valida também a tela de login real, sem inicializar o Supabase.
      const authResult = await page.evaluate(() => {
        document.querySelector('main').style.display = 'none';
        document.querySelector('header').style.display = 'none';
        const gate = document.querySelector('#authGate');
        gate.style.display = 'grid';
        document.querySelector('#authLoading')?.classList.add('hidden');
        document.querySelector('#loginFields')?.classList.remove('hidden');
        const panel = gate.querySelector('.panel').getBoundingClientRect();
        const controls = [...gate.querySelectorAll('input,button')].filter(el => el.offsetWidth || el.offsetHeight);
        const outside = controls.some(el => {
          const r = el.getBoundingClientRect();
          return r.left < panel.left - 0.5 || r.right > panel.right + 0.5;
        });
        return { overflow: document.documentElement.scrollWidth > innerWidth, outside, panelWidth: Math.round(panel.width) };
      });
      await page.screenshot({ path: 'artifacts/' + viewport.name + '-login.png', fullPage: true });
      if (authResult.overflow || authResult.outside) {
        failures++;
        console.error('FAIL ' + viewport.name + '/login: ' + JSON.stringify(authResult));
      } else {
        console.log('PASS ' + viewport.name + '/login: formulário dentro do painel');
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log('Resumo: ' + checkedScreens + ' telas reais verificadas em ' + viewports.length + ' tamanhos de viewport.');
  if (failures) {
    console.error(failures + ' falha(s) visual(is) encontrada(s).');
    process.exit(1);
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
