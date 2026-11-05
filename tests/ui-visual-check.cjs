const { chromium } = require('playwright');

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
        };
      });

      await page.screenshot({ path: `artifacts/react-${viewport.name}.png`, fullPage: true });

      if (login.overflow || !login.cardVisible || login.cardOutside || login.inputOutside || pageErrors.length) {
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
  } finally {
    await browser.close();
  }
  if (failures) process.exit(1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
