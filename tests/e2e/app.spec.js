import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const mockBackend = "(() => {\n  const user = { id: 'test-owner-0001', email: 'owner@test.invalid', user_metadata: { full_name: 'Conta de Teste' } };\n  const companyId = 'test-company-0001';\n  let session = null;\n  const members = [{ user_id: user.id, company_id: companyId, role: 'owner' }];\n  const rows = {\n    company_members: members,\n    companies: [{ id: companyId, name: 'Empresa de Teste', logo_url: null, home_image_url: null }],\n    customers: [], products: [], product_units: [], rentals: [], financial_transactions: [],\n    product_images: [], profiles: [{ id: user.id, full_name: 'Conta de Teste' }],\n    rental_responsibles: [], occurrence_reports: [], occurrence_photos: [],\n    team_conversations: [], team_conversation_members: [], team_messages: []\n  };\n  function resultFor(table, mode) {\n    const data = rows[table] || [];\n    if (mode === 'single') return { data: data[0] || null, error: data.length ? null : { message: 'No rows' } };\n    if (mode === 'maybeSingle') return { data: data[0] || null, error: null };\n    return { data: data.slice(), error: null };\n  }\n  function query(table) {\n    let mode = 'many';\n    const q = {\n      select() { return this; }, eq() { return this; }, neq() { return this; },\n      order() { return this; }, in() { return this; }, limit() { return this; },\n      update() { return this; }, insert(payload) { if (Array.isArray(rows[table])) rows[table].push(...(Array.isArray(payload) ? payload : [payload])); return this; },\n      upsert() { return this; }, delete() { return this; },\n      single() { mode = 'single'; return Promise.resolve(resultFor(table, mode)); },\n      maybeSingle() { mode = 'maybeSingle'; return Promise.resolve(resultFor(table, mode)); },\n      then(resolve, reject) { return Promise.resolve(resultFor(table, mode)).then(resolve, reject); }\n    };\n    return q;\n  }\n  const auth = {\n    async getSession() { return { data: { session }, error: null }; },\n    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },\n    async signInWithPassword() { session = { user, access_token: 'test-token' }; return { data: { user, session }, error: null }; },\n    async signOut() { session = null; return { error: null }; },\n    async resetPasswordForEmail() { return { error: null }; },\n    async updateUser() { return { error: null }; },\n    async exchangeCodeForSession() { return { data: { session }, error: null }; },\n    async verifyOtp() { return { data: { session }, error: null }; },\n    async setSession() { session = { user }; return { data: { session }, error: null }; }\n  };\n  const storage = { from() { return {\n    async createSignedUrls() { return { data: [], error: null }; },\n    async upload() { return { data: {}, error: null }; },\n    getPublicUrl(path) { return { data: { publicUrl: 'https://test.invalid/' + path } }; },\n    async remove() { return { data: [], error: null }; }\n  }; } };\n  window.supabase = { createClient() {\n    return {\n      auth, storage, from: query,\n      functions: { async invoke() { return { data: { members: [] }, error: null }; } },\n      async rpc() { return { data: 'test-conversation-0001', error: null }; },\n      channel() { return { on() { return this; }, subscribe() { return this; } }; },\n      async removeChannel() {}\n    };\n  } };\n})();";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(mockBackend);
  await page.route(/https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)\/.*/, route => route.abort());
  await page.goto('/');
});
test('abre o login sem ficar preso na verificação da sessão', async ({ page }) => {
  await expect(page.locator('#authLoading')).toBeHidden();
  await expect(page.locator('#loginFields')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeEnabled();
});
test('autentica no backend isolado e carrega o painel', async ({ page }) => {
  await page.locator('#loginEmail').fill('owner@test.invalid');
  await page.locator('#loginPassword').fill('senha-de-teste');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('#authGate')).toBeHidden();
  await expect(page.locator('#inicio')).toBeVisible();
  await expect(page.locator('#greetingName')).toContainText('Conta');
});
test('todas as telas principais abrem pelo menu e mantêm a navegação funcional', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('#loginEmail').fill('owner@test.invalid');
  await page.locator('#loginPassword').fill('senha-de-teste');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('#inicio')).toBeVisible();
  const screens = ['agenda','locacoes','clientes','estoque','financeiro','funcionarios','mensagens','ocorrencias','relatorios','config'];
  for (const screen of screens) {
    await page.locator('.menu-trigger').click();
    await page.locator('#menuPanel [data-page="' + screen + '"]').click();
    await expect(page.locator('#' + screen)).toBeVisible();
  }
  expect(errors).toEqual([]);
});
test('formulário de cliente abre e valida campos obrigatórios', async ({ page }) => {
  await page.locator('#loginEmail').fill('owner@test.invalid');
  await page.locator('#loginPassword').fill('senha-de-teste');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.locator('.menu-trigger').click();
  await page.locator('#menuPanel [data-page="clientes"]').click();
  await page.getByRole('button', { name: /Novo/ }).click();
  await expect(page.locator('#form')).toBeVisible();
  await page.evaluate(() => saveClient());
  await expect(page.locator('#toast')).toContainText('Informe o nome');
});
test('aplicativo não depende de arquivos remotos para renderizar a estrutura inicial', async ({ page }) => {
  const html = await readFile(join(process.cwd(), 'index.html'), 'utf8');
  expect(html).toContain('Verificando sua sessão e preparando o aplicativo');
  expect(html).toContain('initializeAuthFlow()');
  expect(html).toContain('resumeSession()');
  expect(html).toContain('id="inicio"');
});
test('logout encerra a sessão simulada e retorna à tela de login', async ({ page }) => {
  await page.locator('#loginEmail').fill('owner@test.invalid');
  await page.locator('#loginPassword').fill('senha-de-teste');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('#inicio')).toBeVisible();
  await page.locator('.menu-trigger').click();
  await page.locator('#menuLogoutButton').click();
  await expect(page.locator('#authGate')).toBeVisible();
  await expect(page.locator('#loginFields')).toBeVisible();
});
test('layout móvel não cria rolagem horizontal na tela inicial e nas telas internas', async ({ page }) => {
  await page.locator('#loginEmail').fill('owner@test.invalid');
  await page.locator('#loginPassword').fill('senha-de-teste');
  await page.getByRole('button', { name: 'Entrar' }).click();
  for (const screen of ['inicio', 'agenda', 'locacoes', 'clientes', 'estoque', 'financeiro', 'config']) {
    if (screen !== 'inicio') {
      await page.locator('.menu-trigger').click();
      await page.locator('#menuPanel [data-page="' + screen + '"]').click();
    }
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth
    }));
    expect(dimensions.content, 'overflow horizontal em ' + screen).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
});

test('cadastro de cliente salva e reaparece na listagem isolada', async ({ page }) => {
  await page.locator('#loginEmail').fill('owner@test.invalid');
  await page.locator('#loginPassword').fill('senha-de-teste');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.locator('.menu-trigger').click();
  await page.locator('#menuPanel [data-page="clientes"]').click();
  await page.getByRole('button', { name: /Novo/ }).click();
  await page.locator('#fName').fill('Cliente QA');
  await page.locator('#fPhone').fill('(31) 90000-0000');
  await page.evaluate(() => saveClient());
  await expect(page.locator('#toast')).toContainText('Cliente salvo');
  await expect(page.locator('#clientList')).toContainText('Cliente QA');
});
test('funcionário não consegue abrir formulário financeiro', async ({ page }) => {
  await page.goto('/?role=staff');
  await page.locator('#loginEmail').fill('staff@test.invalid');
  await page.locator('#loginPassword').fill('senha-de-teste');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.evaluate(() => openForm('transaction'));
  await expect(page.locator('#toast')).toContainText('Acesso financeiro restrito');
  await expect(page.locator('#form')).toBeHidden();
});

test('estoque, locação e financeiro rejeitam formulários incompletos', async ({ page }) => {
  await page.locator('#loginEmail').fill('owner@test.invalid');
  await page.locator('#loginPassword').fill('senha-de-teste');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.evaluate(() => openForm('product'));
  await page.evaluate(() => saveProduct());
  await expect(page.locator('#toast')).toContainText('Confira os dados');

  await page.evaluate(() => openForm('rental'));
  await page.evaluate(() => saveRental());
  await expect(page.locator('#toast')).toContainText('Informe cliente, brinquedos');

  await page.evaluate(() => openForm('transaction'));
  await page.evaluate(() => saveTransaction());
  await expect(page.locator('#toast')).toContainText('Informe descrição e valor');
});
