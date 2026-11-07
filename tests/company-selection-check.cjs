const { chromium } = require('playwright');

const baseUrl = process.env.KIDSLOC_BASE_URL || 'http://127.0.0.1:4173/kidsloc-app/';
const supabaseOrigin = 'https://wcxvswomcfpeuhnbxivh.supabase.co';
const ownerId = 'e9ee1898-2cb0-42d0-a40a-a1176c5f7635';
const companies = [
  { id: 'b5234db8-d73a-42da-beba-a55e83578cd8', name: 'Festejando' },
  { id: 'd6086a26-623a-4ca3-8e9e-eef3c5f44b1d', name: 'Sonho Kids Brinquedos' },
];
const state = { userMetadata: {} };

function makeUser() {
  return {
    id: ownerId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'owner@kidsloc.test',
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { ...state.userMetadata },
    identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function json(body, status = 200, headers = {}) {
  return {
    status,
    contentType: 'application/json',
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'apikey,authorization,content-type,x-client-info',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const apiCalls = [];

    await page.route(supabaseOrigin + '/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      apiCalls.push(method + ' ' + url.pathname);

      if (method === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': 'apikey,authorization,content-type,x-client-info',
            'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          },
        });
      }
      if (url.pathname === '/auth/v1/token' && method === 'POST') {
        return route.fulfill(json({
          access_token: 'test-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: 'test-refresh-token',
          user: makeUser(),
        }));
      }
      if (url.pathname === '/auth/v1/user' && method === 'GET') {
        return route.fulfill(json(makeUser()));
      }
      if (url.pathname === '/auth/v1/user' && (method === 'PUT' || method === 'PATCH')) {
        const body = request.postDataJSON();
        state.userMetadata = { ...state.userMetadata, ...(body.user_metadata || body.data || {}) };
        return route.fulfill(json(makeUser()));
      }
      if (url.pathname === '/rest/v1/rpc/is_platform_owner' && method === 'POST') {
        return route.fulfill(json(true));
      }
      if (url.pathname === '/rest/v1/companies' && method === 'GET') {
        return route.fulfill(json(companies, 200, { 'content-range': '0-1/2' }));
      }
      return route.fulfill(json({ message: 'Unexpected mocked request: ' + method + ' ' + url.pathname }, 500));
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('E-mail', { exact: true }).fill('owner@kidsloc.test');
    await page.getByLabel('Senha', { exact: true }).fill('test-password');
    await page.getByRole('button', { name: 'Entrar' }).click();

    const companySelect = page.getByLabel('Selecionar empresa');
    await companySelect.waitFor({ state: 'visible', timeout: 15000 });
    if (await companySelect.inputValue() !== '') {
      throw new Error('A conta sem preferência salva recebeu uma empresa automaticamente.');
    }
    if ((await companySelect.locator('option:checked').textContent()).trim() !== 'Selecione uma empresa') {
      throw new Error('O seletor não iniciou no estado neutro.');
    }

    // Reload before choosing: it must remain without an active company.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByLabel('Selecionar empresa').waitFor({ state: 'visible', timeout: 15000 });
    if (await page.getByLabel('Selecionar empresa').inputValue() !== '') {
      throw new Error('A recarga selecionou uma empresa sem escolha explícita.');
    }

    await page.getByLabel('Selecionar empresa').selectOption(companies[1].id);
    await page.locator('.legacy-company-switcher').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(id => {
      const select = document.querySelector('.legacy-company-switcher');
      return select && select.value === id;
    }, companies[1].id);

    if (state.userMetadata.kidsloc_selected_company_id !== companies[1].id) {
      throw new Error('A escolha explícita não foi persistida no perfil remoto simulado.');
    }

    // Simulate profile metadata being unavailable on a later refresh; the
    // locally confirmed choice must still restore for this browser.
    state.userMetadata = {};
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.legacy-company-switcher').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(id => {
      const select = document.querySelector('.legacy-company-switcher');
      return select && select.value === id;
    }, companies[1].id);

    if (!apiCalls.some(call => call === 'PUT /auth/v1/user')) {
      throw new Error('O fluxo não chamou a persistência da preferência.');
    }

    console.log('PASS company-selection: sem padrão, permanece sem empresa após recarga, salva a escolha explícita e restaura Sonho Kids Brinquedos após nova recarga.');
    await context.close();
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error('FAIL company-selection:', error);
  process.exit(1);
});
