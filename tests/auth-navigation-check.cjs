// Auth, role visibility, navigation and logout regression checks.
// All Supabase requests are intercepted; no production account or data is used.
const { chromium } = require('playwright');

const baseUrl = process.env.KIDSLOC_BASE_URL || 'http://127.0.0.1:4173/kidsloc-app/';
const supabaseOrigin = 'https://wcxvswomcfpeuhnbxivh.supabase.co';
const member = {
  id: 'a1c00000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'staff@kidsloc.test',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
  phone: '',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Funcionário de teste' },
  identities: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};
const company = { id: 'b1c00000-0000-4000-8000-000000000001', name: 'Empresa de teste' };

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

async function installSupabaseMocks(page, mode) {
  const calls = [];
  await page.route(supabaseOrigin + '/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    calls.push(`${method} ${url.pathname}`);

    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'apikey,authorization,content-type,x-client-info',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      }});
    }

    if (url.pathname === '/auth/v1/token' && method === 'POST') {
      if (mode === 'invalid-login') {
        return route.fulfill(json({
          code: 'invalid_credentials',
          msg: 'Invalid login credentials',
        }, 400));
      }
      return route.fulfill(json({
        access_token: 'test-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'test-refresh-token',
        user: member,
      }));
    }

    if (url.pathname === '/auth/v1/user' && method === 'GET') {
      return route.fulfill(json(member));
    }

    if (url.pathname === '/auth/v1/recover' && method === 'POST') {
      return route.fulfill(json({}));
    }

    if (url.pathname === '/rest/v1/rpc/is_platform_owner' && method === 'POST') {
      return route.fulfill(json(false));
    }

    if (url.pathname === '/rest/v1/company_members' && method === 'GET') {
      return route.fulfill(json({ company_id: company.id, role: 'staff' }));
    }

    if (url.pathname === '/rest/v1/companies' && method === 'GET') {
      return route.fulfill(json(company));
    }

    // Other read-only module requests receive empty fixtures. No writes are accepted.
    if (method === 'GET') return route.fulfill(json([]));
    return route.fulfill(json({ message: `Unexpected mocked request: ${method} ${url.pathname}` }, 500));
  });
  return calls;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    // Invalid credentials must produce the friendly error and stay on login.
    {
      const page = await browser.newPage();
      const calls = await installSupabaseMocks(page, 'invalid-login');
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByLabel('E-mail', { exact: true }).fill('wrong@kidsloc.test');
      await page.getByLabel('Senha', { exact: true }).fill('wrong-password');
      await page.getByRole('button', { name: 'Entrar' }).click();
      await page.getByRole('status').filter({ hasText: 'E-mail ou senha incorretos.' }).waitFor({ state: 'visible' });
      if (!(await page.getByRole('button', { name: 'Entrar' }).isVisible())) {
        throw new Error('O login inválido não permaneceu na tela de acesso.');
      }
      if (!calls.includes('POST /auth/v1/token')) throw new Error('A tentativa de login não chegou ao endpoint simulado.');
      console.log('PASS auth-invalid: credenciais inválidas exibem mensagem amigável e mantêm o usuário no login.');
      await page.close();
    }

    // Password recovery must call only the mocked recovery endpoint.
    {
      const page = await browser.newPage();
      const calls = await installSupabaseMocks(page, 'recovery');
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
      await page.getByLabel('E-mail cadastrado', { exact: true }).fill('staff@kidsloc.test');
      await page.getByRole('button', { name: 'Enviar link de recuperação' }).click();
      await page.getByRole('status').filter({ hasText: 'Se o e-mail estiver cadastrado' }).waitFor({ state: 'visible' });
      if (!calls.includes('POST /auth/v1/recover')) throw new Error('A recuperação não chamou o endpoint simulado.');
      await page.getByRole('button', { name: 'Voltar ao login' }).click();
      if (!(await page.getByRole('button', { name: 'Entrar' }).isVisible())) {
        throw new Error('O fluxo de recuperação não retornou ao login.');
      }
      console.log('PASS auth-recovery: solicitação simulada concluída e retorno ao login funcionando.');
      await page.close();
    }

    // A staff account must not see admin-only destinations; navigation/back/logout work.
    {
      const page = await browser.newPage();
      await installSupabaseMocks(page, 'member');
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByLabel('E-mail', { exact: true }).fill(member.email);
      await page.getByLabel('Senha', { exact: true }).fill('test-password');
      await page.getByRole('button', { name: 'Entrar' }).click();
      await page.getByRole('button', { name: 'Abrir menu' }).waitFor({ state: 'visible', timeout: 15000 });
      await page.getByRole('button', { name: 'Abrir menu' }).click();
      const navigation = page.getByRole('navigation', { name: 'Menus de navegação' });
      await navigation.getByRole('button', { name: 'Clientes' }).waitFor({ state: 'visible' });
      if (await navigation.getByRole('button', { name: 'Financeiro' }).count()) {
        throw new Error('A conta de funcionário recebeu acesso visual ao Financeiro.');
      }
      if (await navigation.getByRole('button', { name: 'Marketing e anúncios' }).count()) {
        throw new Error('A conta de funcionário recebeu acesso visual ao Marketing.');
      }
      await navigation.getByRole('button', { name: 'Clientes' }).click();
      await page.locator('h1').filter({ hasText: /^Clientes$/ }).waitFor({ state: 'visible' });
      await page.goBack();
      await page.getByText('Resumo do negócio', { exact: true }).waitFor({ state: 'visible' });
      await page.getByRole('button', { name: 'Abrir menu' }).click();
      await page.getByRole('navigation', { name: 'Menus de navegação' }).getByRole('button', { name: 'Sair' }).click();
      await page.getByRole('button', { name: 'Entrar' }).waitFor({ state: 'visible' });
      console.log('PASS auth-role-navigation: funcionário navega, não vê opções administrativas, usa voltar e encerra a sessão.');
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error('FAIL auth-navigation:', error);
  process.exit(1);
});
