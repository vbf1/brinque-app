import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { CustomersPage } from './data/CustomersPage';
import { ProductsPage } from './data/ProductsPage';
import { RentalsPage } from './data/RentalsPage';
import { AgendaPage } from './data/AgendaPage';
import { StatisticsPage } from './data/StatisticsPage';
import { FinancePage } from './data/FinancePage';
import { OccurrencesPage } from './data/OccurrencesPage';
import { TeamChatPage } from './data/TeamChatPage';
import { MarketingPage } from './data/MarketingPage';
import { ContractsPage } from './data/ContractsPage';
import { PublicContractPage } from './data/PublicContractPage';
import { CheckoutPage } from './data/CheckoutPage';
import { UsersPage } from './data/UsersPage';
import { ServicesPage } from './data/ServicesPage';
import { QuotesPage } from './data/QuotesPage';
import { CompanySettingsPage } from './data/CompanySettingsPage';
import { PlatformAdminPage } from './data/PlatformAdminPage';

declare global {
  interface Window {
    KidsLocNative?: { postMessage: (message: string) => void };
  }
}

type CompanyContext = { id: string; name: string; role: string };
type Page = 'inicio' | 'agenda' | 'estatisticas' | 'locacoes' | 'clientes' | 'estoque' | 'financeiro' | 'ocorrencias' | 'mensagens' | 'marketing' | 'contratos' | 'usuarios' | 'servicos' | 'orcamentos' | 'configuracoes' | 'administracao';

const pagePaths: Record<Page, string> = {
  inicio: 'inicio',
  agenda: 'agenda',
  estatisticas: 'estatisticas',
  locacoes: 'locacoes',
  contratos: 'contratos',
  clientes: 'clientes',
  estoque: 'estoque',
  financeiro: 'financeiro',
  ocorrencias: 'ocorrencias',
  mensagens: 'mensagens',
  marketing: 'marketing',
  usuarios: 'usuarios',
  servicos: 'servicos',
  orcamentos: 'orcamentos',
  configuracoes: 'configuracoes',
  administracao: 'administracao',
};

function pageFromLocation(): Page {
  const base = import.meta.env.BASE_URL;
  const pathname = window.location.pathname;
  const relativePath = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\/+/, '');
  const segment = relativePath.split('/').filter(Boolean)[0] ?? '';
  return (Object.keys(pagePaths) as Page[]).find(page => pagePaths[page] === segment) ?? 'inicio';
}

function pathForPage(page: Page): string {
  return import.meta.env.BASE_URL + pagePaths[page];
}
const PASSWORD_RESET_REDIRECT = 'https://vbf1.github.io/kidsloc-app/';

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(
      value => { window.clearTimeout(timeout); resolve(value); },
      error => { window.clearTimeout(timeout); reject(error); },
    );
  });
}

function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const value = raw.toLowerCase();
  if (value.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (value.includes('email not confirmed')) return 'Seu e-mail ainda não foi confirmado.';
  if (value.includes('otp_expired') || value.includes('expired')) return 'O link expirou ou já foi utilizado. Solicite outro.';
  return raw || 'Não foi possível concluir a operação. Tente novamente.';
}

const navigation: Array<{ id: Page; label: string; icon: string; admin?: boolean; platformOnly?: boolean }> = [
  { id: 'inicio', label: 'Início', icon: '▦' },
  { id: 'agenda', label: 'Agenda', icon: '▦' },
  { id: 'estatisticas', label: 'Estatísticas', icon: '▥' },
  { id: 'locacoes', label: 'Locações', icon: '▣' },
  { id: 'contratos', label: 'Contratos', icon: '✎' },
  { id: 'clientes', label: 'Clientes', icon: '♙' },
  { id: 'estoque', label: 'Estoque', icon: '▤' },
  { id: 'servicos', label: 'Serviços', icon: '✦' },
  { id: 'orcamentos', label: 'Orçamentos', icon: '▧' },
  { id: 'financeiro', label: 'Financeiro', icon: '＄', admin: true },
  { id: 'mensagens', label: 'Mensagens', icon: '▰' },
  { id: 'ocorrencias', label: 'Ocorrências', icon: '⚠' },
  { id: 'marketing', label: 'Marketing e anúncios', icon: '✧', admin: true },
  { id: 'usuarios', label: 'Usuários', icon: '♙', admin: true },
  { id: 'configuracoes', label: 'Configurações', icon: '⚙', admin: true },
  { id: 'administracao', label: 'Administração da plataforma', icon: '⌘', platformOnly: true },
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [company, setCompany] = useState<CompanyContext | null>(null);
  const [platformOwner, setPlatformOwner] = useState(false);
  const [availableCompanies, setAvailableCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [page, setPage] = useState<Page>(() => pageFromLocation());

  const navigateTo = useCallback((nextPage: Page) => {
    const nextPath = pathForPage(nextPage);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({ kidsLocApp: true, page: nextPage }, '', nextPath);
    }
    setPage(nextPage);
  }, []);

  useEffect(() => {
    if (!company) return;
    const handlePopState = () => {
      setPage(pageFromLocation());
      setMenuOpen(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [company?.id]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return localStorage.getItem('brq_theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  });
  const feedback = useCallback((value: string, error = false) => {
    setMessage(value);
    setIsError(error);
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme === 'dark' ? 'dark' : '';
    try { localStorage.setItem('brq_theme', theme === 'dark' ? 'dark' : ''); } catch { /* storage is optional */ }
  }, [theme]);

  useEffect(() => {
    let active = true;
    const timeoutId = window.setTimeout(() => {
      if (!active) return;
      setSession(null);
      setLoading(false);
      feedback('A verificação da sessão está demorando. Confira sua conexão e tente entrar novamente.', true);
    }, 15000);
    const initialize = async () => {
      try {
        const url = new URL(window.location.href);
        const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
        const type = url.searchParams.get('type') ?? hash.get('type');
        const code = url.searchParams.get('code');
        const tokenHash = url.searchParams.get('token_hash');
        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');
        try {
          if (code && (type === 'recovery' || type === 'invite')) {
            await supabase.auth.exchangeCodeForSession(code);
            setRecovery(true);
            window.history.replaceState({}, document.title, url.pathname);
          } else if (tokenHash && (type === 'recovery' || type === 'invite')) {
            await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as 'recovery' | 'invite' });
            setRecovery(true);
            window.history.replaceState({}, document.title, url.pathname);
          } else if (accessToken && refreshToken) {
            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            if (type === 'recovery' || type === 'invite') setRecovery(true);
            window.history.replaceState({}, document.title, url.pathname);
          }
        } catch (error) {
          feedback(friendlyError(error), true);
          await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        }
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;
        if (error) feedback(friendlyError(error), true);
        setSession(data.session);
      } catch (error) {
        if (active) {
          setSession(null);
          feedback('Não foi possível verificar sua sessão: ' + friendlyError(error), true);
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (active) setLoading(false);
      }
    };
    void initialize();
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (window.KidsLocNative) {
        if (nextSession && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          window.KidsLocNative.postMessage(JSON.stringify({
            type: 'session',
            access_token: nextSession.access_token,
            refresh_token: nextSession.refresh_token,
          }));
        } else if (event === 'SIGNED_OUT') {
          window.KidsLocNative.postMessage(JSON.stringify({ type: 'signed_out' }));
        }
      }
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') {
        setCompany(null);
        setPage('inicio');
        window.history.replaceState({ kidsLocApp: true, page: 'inicio' }, '', pathForPage('inicio'));
        setMenuOpen(false);
        setRecovery(false);
        setForgot(false);
        setPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    });
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      data.subscription.unsubscribe();
    };
  }, [feedback]);

  useEffect(() => {
    let active = true;
    if (!session) {
      setCompany(null);
      setPlatformOwner(false);
      setAvailableCompanies([]);
      setCompanyLoading(false);
      return;
    }
    setCompanyLoading(true);
    const timeoutId = window.setTimeout(() => {
      if (active) {
        setCompanyLoading(false);
        feedback('O carregamento dos dados da empresa demorou mais que o esperado. Atualize a página ou tente novamente.', true);
      }
    }, 15000);
    void (async () => {
      try {
        const { data: isGlobalOwner, error: ownerCheckError } = await supabase.rpc('is_platform_owner');
        if (ownerCheckError) throw ownerCheckError;
        if (isGlobalOwner) {
          const { data: companyList, error: companiesError } = await supabase.from('companies')
            .select('id, name').order('name', { ascending: true });
          if (companiesError) throw companiesError;
          if (!active) return;
          setPlatformOwner(true);
          setAvailableCompanies(companyList ?? []);
          if (!companyList?.length) {
            setCompany(null);
            feedback('Nenhuma empresa cadastrada. Crie a primeira empresa nas configurações.', true);
            return;
          }
          setCompany({ id: companyList[0].id, name: companyList[0].name, role: 'owner' });
          feedback('');
          return;
        }
        setPlatformOwner(false);
        setAvailableCompanies([]);
        const { data: member, error: memberError } = await supabase.from('company_members')
          .select('company_id, role').eq('user_id', session.user.id).limit(1).maybeSingle();
        if (memberError) throw memberError;
        if (!member) throw new Error('Esta conta ainda não está vinculada a uma empresa. Peça ao proprietário para conferir seu acesso.');
        const { data: companyData, error: companyError } = await supabase.from('companies')
          .select('id, name').eq('id', member.company_id).single();
        if (companyError) throw companyError;
        if (active) setCompany({ id: companyData.id, name: companyData.name, role: member.role });
      } catch (error) {
        if (active) { setCompany(null); feedback(friendlyError(error), true); }
      } finally {
        window.clearTimeout(timeoutId);
        if (active) setCompanyLoading(false);
      }
    })();
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [session, feedback]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) return feedback('Informe seu e-mail e sua senha.', true);
    setBusy(true); feedback('Validando seu acesso...');
    try {
      const { error } = await withTimeout(supabase.auth.signInWithPassword({ email: email.trim(), password }), 20000, 'O servidor de autenticação demorou demais. Verifique sua conexão e tente novamente.');
      if (error) throw error;
      feedback('Acesso autenticado. Carregando os dados da empresa...');
    } catch (error) { feedback(friendlyError(error), true); }
    finally { setBusy(false); }
  }

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return feedback('Informe o e-mail cadastrado.', true);
    setBusy(true); feedback('Solicitando o link de recuperação...');
    try {
      const { error } = await withTimeout(supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: PASSWORD_RESET_REDIRECT }), 20000, 'O pedido de recuperação demorou demais. Verifique sua conexão e tente novamente.');
      if (error) throw error;
      feedback('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha. Confira também o spam.');
    } catch (error) { feedback(friendlyError(error), true); }
    finally { setBusy(false); }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 6) return feedback('A senha precisa ter pelo menos 6 caracteres.', true);
    if (newPassword !== confirmPassword) return feedback('As senhas não são iguais. Confira e tente novamente.', true);
    setBusy(true); feedback('Atualizando sua senha...');
    try {
      const { error } = await withTimeout(supabase.auth.updateUser({ password: newPassword }), 20000, 'A atualização da senha demorou demais. Verifique sua conexão e tente novamente.');
      if (error) throw error;
      await supabase.auth.signOut({ scope: 'local' });
      setRecovery(false); setNewPassword(''); setConfirmPassword('');
      feedback('Senha definida com sucesso! Entre com seu e-mail e a nova senha.');
    } catch (error) { feedback(friendlyError(error), true); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      feedback('Você saiu. Sua sessão local foi encerrada.');
    } catch (error) { feedback(friendlyError(error), true); }
    finally { setBusy(false); }
  }

  const isAdmin = platformOwner || company?.role === 'owner' || company?.role === 'admin';
  const userLabel = session?.user.user_metadata?.full_name || session?.user.email?.split('@')[0] || 'Bem-vindo';
  const pageTitle = navigation.find(item => item.id === page)?.label ?? 'Início';
  const visibleNavigation = navigation.filter(item => item.platformOnly ? platformOwner : (!item.admin || isAdmin));
  const publicContractToken = new URLSearchParams(window.location.search).get('contract');
  if (publicContractToken) return <PublicContractPage token={publicContractToken} />;
  const isPublicCheckout = new URLSearchParams(window.location.search).has('checkout') || window.location.pathname.split('/').filter(Boolean).at(-1) === 'checkout';
  if (isPublicCheckout) return <CheckoutPage />;

  if (loading) return <main className="legacy-auth-screen"><section className="legacy-auth-card"><div className="legacy-auth-brand"><img src={`${import.meta.env.BASE_URL}kidsloc-brand.webp`} alt="KidsLoc App" /><div className="legacy-auth-wordmark"><strong>KidsLoc <span>App</span></strong><small>GESTÃO DE LOCAÇÕES</small></div><div className="legacy-login-accent" /></div><p className="legacy-muted">Acesse sua empresa</p><div className="legacy-loading">Verificando sua sessão e preparando o aplicativo...</div></section></main>;

  if (recovery && session) return (
    <main className="legacy-auth-screen"><section className="legacy-auth-card">
      <div className="legacy-auth-brand"><img src={`${import.meta.env.BASE_URL}kidsloc-brand.webp`} alt="KidsLoc App" /><div className="legacy-auth-wordmark"><strong>KidsLoc <span>App</span></strong><small>GESTÃO DE LOCAÇÕES</small></div><div className="legacy-login-accent" /></div><p className="legacy-muted">GESTÃO DE LOCAÇÕES</p><h1>Definir nova senha</h1>
      <form onSubmit={updatePassword} className="legacy-form">
        <label htmlFor="new-password">Nova senha</label>
        <input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} placeholder="Digite a nova senha" />
        <label htmlFor="confirm-password">Confirme a nova senha</label>
        <input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} placeholder="Digite novamente" />
        <button disabled={busy} type="submit" className="legacy-primary-button">{busy ? 'Salvando...' : 'Salvar nova senha'}</button>
      </form>
      <p className={isError ? 'legacy-feedback error' : 'legacy-feedback'} role="status">{message}</p>
    </section></main>
  );

  if (!session) return (
    <main className="legacy-auth-screen"><section className="legacy-auth-card">
      <div className="legacy-auth-brand"><img src={`${import.meta.env.BASE_URL}kidsloc-brand.webp`} alt="KidsLoc App" /><div className="legacy-auth-wordmark"><strong>KidsLoc <span>App</span></strong><small>GESTÃO DE LOCAÇÕES</small></div><div className="legacy-login-accent" /></div>
      {forgot && <><h1>Recuperar senha</h1><p className="legacy-intro">Informe o e-mail da conta para receber o link de recuperação.</p></>}
      {forgot ? (
        <form onSubmit={requestReset} className="legacy-form">
          <label htmlFor="email">E-mail cadastrado</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="seuemail@exemplo.com" />
          <button disabled={busy} type="submit" className="legacy-primary-button">{busy ? 'Enviando...' : 'Enviar link de recuperação'}</button>
          <button className="legacy-secondary-button" type="button" onClick={() => { setForgot(false); feedback(''); }}>Voltar ao login</button>
        </form>
      ) : (
        <form onSubmit={login} className="legacy-form">
          <label htmlFor="email">E-mail</label><input id="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required placeholder="seuemail@exemplo.com" />
          <label htmlFor="password">Senha</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Sua senha" />
          <button disabled={busy} type="submit" className="legacy-primary-button">{busy ? 'Entrando...' : 'Entrar'}</button>
          <button className="legacy-secondary-button" type="button" onClick={() => { setForgot(true); feedback(''); }}>Esqueci minha senha</button>
        </form>
      )}
      <p className={isError ? 'legacy-feedback error' : 'legacy-feedback'} role="status">{message || 'Entre com seu e-mail e senha atuais.'}</p>
    </section></main>
  );

  if (companyLoading) return <main className="legacy-auth-screen"><section className="legacy-auth-card"><div className="legacy-auth-brand"><img src={`${import.meta.env.BASE_URL}kidsloc-brand.webp`} alt="KidsLoc App" /><div className="legacy-auth-wordmark"><strong>KidsLoc <span>App</span></strong><small>GESTÃO DE LOCAÇÕES</small></div><div className="legacy-login-accent" /></div><div className="legacy-loading">Carregando os dados da empresa...</div></section></main>;
  if (!company && platformOwner) return <main className="legacy-auth-screen"><section className="legacy-auth-card" style={{ width: 'min(900px, 100%)' }}><div className="legacy-auth-brand"><img src={`${import.meta.env.BASE_URL}kidsloc-brand.webp`} alt="KidsLoc App" /><div className="legacy-auth-wordmark"><strong>KidsLoc <span>App</span></strong><small>GESTÃO DE LOCAÇÕES</small></div><div className="legacy-login-accent" /></div><PlatformAdminPage currentCompanyId="" companies={availableCompanies} onCompaniesChanged={setAvailableCompanies} onSelectCompany={selected => setCompany({ ...selected, role: 'owner' })} /><button onClick={logout} disabled={busy} className="legacy-secondary-button">Sair</button></section></main>;
  if (!company) return <main className="legacy-auth-screen"><section className="legacy-auth-card"><div className="legacy-auth-brand"><img src={`${import.meta.env.BASE_URL}kidsloc-brand.webp`} alt="KidsLoc App" /><div className="legacy-auth-wordmark"><strong>KidsLoc <span>App</span></strong><small>GESTÃO DE LOCAÇÕES</small></div><div className="legacy-login-accent" /></div><h1>Acesso sem empresa vinculada</h1><p className="legacy-intro">{message || 'Esta conta não está vinculada a uma empresa.'}</p><button onClick={logout} disabled={busy} className="legacy-primary-button">Sair</button></section></main>;

  return (
    <div className="legacy-app">
      <header className="legacy-header">
        <div className="legacy-headrow">
          <div className="legacy-brand"><div className="legacy-logo"><img src={`${import.meta.env.BASE_URL}kidsloc-brand.webp`} alt="KidsLoc App" /></div><div><strong>KIDSLOC APP</strong><span>GESTÃO DE LOCAÇÕES</span></div></div>
          <div className="legacy-head-actions">
            <button type="button" className="legacy-theme-button" aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☾' : '☀'}</button>
            <button type="button" className="legacy-menu-trigger" aria-label="Abrir menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><span /><span /><span /></button>
          </div>
        </div>
        <div className="legacy-greeting">Olá, {userLabel} 👋<small>{company.name} · Gestão de locações sincronizada.</small>{platformOwner && <label className="legacy-company-switcher-label">Empresa selecionada<select className="legacy-company-switcher" value={company.id} onChange={event => { const selected = availableCompanies.find(item => item.id === event.target.value); if (selected) { setCompany({ ...selected, role: 'owner' }); setPage('inicio'); } }}>{availableCompanies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}</div>
      </header>
      {menuOpen && <button className="legacy-menu-backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
      <nav className={menuOpen ? 'legacy-menu-panel open' : 'legacy-menu-panel'} aria-label="Menus de navegação">
        {visibleNavigation.map(item => <button type="button" key={item.id} className={page === item.id ? 'active' : ''} onClick={() => { navigateTo(item.id); setMenuOpen(false); }}><span>{item.icon}</span>{item.label}</button>)}
        <button type="button" className="legacy-menu-logout" onClick={() => { setMenuOpen(false); void logout(); }}><span>↪</span>Sair</button>
      </nav>

      <main className="legacy-main">
        {page === 'inicio' && (
          <section>
            <div className="legacy-section-title">Resumo do negócio <span>Seus dados</span></div>
            <div className="legacy-dashboard-grid">
              <button className="legacy-dashboard-card" onClick={() => navigateTo('agenda')}><span className="legacy-card-icon">▦</span><strong>Agenda de reservas</strong><small>Visualize os agendamentos no calendário</small></button>
              <button className="legacy-dashboard-card" onClick={() => navigateTo('estatisticas')}><span className="legacy-card-icon">▥</span><strong>Estatísticas</strong><small>Veja os brinquedos e clientes em destaque</small></button>
              <button className="legacy-dashboard-card" onClick={() => navigateTo('locacoes')}><span className="legacy-card-icon">▣</span><strong>Locações</strong><small>Gerencie reservas e entregas</small></button>
              <button className="legacy-dashboard-card" onClick={() => navigateTo('contratos')}><span className="legacy-card-icon">✎</span><strong>Contratos</strong><small>Gere e acompanhe assinaturas</small></button>
              <button className="legacy-dashboard-card" onClick={() => navigateTo('clientes')}><span className="legacy-card-icon">♙</span><strong>Clientes</strong><small>Consulte e cadastre clientes</small></button>
              <button className="legacy-dashboard-card" onClick={() => navigateTo('estoque')}><span className="legacy-card-icon">▤</span><strong>Brinquedos e estoque</strong><small>Controle itens e unidades</small></button>
              <button className="legacy-dashboard-card" onClick={() => navigateTo('servicos')}><span className="legacy-card-icon">✦</span><strong>Serviços</strong><small>Cadastre serviços e preços</small></button>
              <button className="legacy-dashboard-card" onClick={() => navigateTo('orcamentos')}><span className="legacy-card-icon">R$</span><strong>Orçamentos</strong><small>Monte propostas para clientes</small></button>
              {isAdmin && <button className="legacy-dashboard-card" onClick={() => navigateTo('financeiro')}><span className="legacy-card-icon">＄</span><strong>Financeiro</strong><small>Entradas e saídas</small></button>}
              <button className="legacy-dashboard-card" onClick={() => navigateTo('mensagens')}><span className="legacy-card-icon">▰</span><strong>Mensagens da equipe</strong><small>Converse com os funcionários</small></button>
              <button className="legacy-dashboard-card" onClick={() => navigateTo('ocorrencias')}><span className="legacy-card-icon">⚠</span><strong>Ocorrências</strong><small>Registre e acompanhe relatos</small></button>
              {isAdmin && <button className="legacy-dashboard-card" onClick={() => navigateTo('marketing')}><span className="legacy-card-icon">✧</span><strong>Marketing e anúncios</strong><small>Crie, revise e organize divulgações</small></button>}
              {platformOwner && <button className="legacy-dashboard-card" onClick={() => navigateTo('administracao')}><span className="legacy-card-icon">⌘</span><strong>Administração da plataforma</strong><small>Gerencie empresas e usuários globalmente</small></button>}
            </div>
            <section className="legacy-panel legacy-welcome-panel"><div><strong>Sessão ativa</strong><span>Conectado à empresa {company.name}</span></div><span className="legacy-status"><i /> {company.role === 'owner' ? 'Proprietário' : company.role === 'admin' ? 'Administrador' : 'Funcionário'}</span></section>
          </section>
        )}
        {page !== 'inicio' && <div className="legacy-page-heading"><div><span>GESTÃO DE LOCAÇÕES</span><h1>{pageTitle}</h1></div><button type="button" className="legacy-back-button" onClick={() => navigateTo('inicio')}>‹ Início</button></div>}
        {page === 'agenda' && <AgendaPage companyId={company.id} onOpenRentals={() => navigateTo('locacoes')} />}
        {page === 'estatisticas' && <StatisticsPage companyId={company.id} />}
        {page === 'clientes' && <CustomersPage companyId={company.id} />}
        {page === 'estoque' && <ProductsPage companyId={company.id} />}
        {page === 'servicos' && <ServicesPage companyId={company.id} />}
        {page === 'orcamentos' && <QuotesPage companyId={company.id} />}
        {page === 'locacoes' && <RentalsPage companyId={company.id} />}
        {page === 'contratos' && <ContractsPage companyId={company.id} companyName={company.name} />}
        {page === 'financeiro' && isAdmin && <FinancePage companyId={company.id} />}
        {page === 'ocorrencias' && <OccurrencesPage companyId={company.id} role={company.role} />}
        {page === 'mensagens' && <TeamChatPage companyId={company.id} />}
        {page === 'marketing' && isAdmin && <MarketingPage companyId={company.id} userId={session.user.id} />}
        {page === 'usuarios' && isAdmin && <UsersPage companyId={company.id} viewerRole={platformOwner ? 'owner' : company.role} />}
        {page === 'configuracoes' && isAdmin && <CompanySettingsPage companyId={company.id} companyName={company.name} theme={theme} onThemeChange={setTheme} onSaved={name => { setCompany(current => current ? { ...current, name } : current); setAvailableCompanies(current => current.map(item => item.id === company.id ? { ...item, name } : item)); }} />}
        {page === 'administracao' && platformOwner && <PlatformAdminPage currentCompanyId={company.id} companies={availableCompanies} onCompaniesChanged={setAvailableCompanies} onSelectCompany={selected => setCompany({ ...selected, role: 'owner' })} />}
      </main>
      <footer className="legacy-footer">KIDSLOC APP <span>·</span> {company.name}</footer>
    </div>
  );
}
