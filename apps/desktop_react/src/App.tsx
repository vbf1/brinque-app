import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { CustomersPage } from './data/CustomersPage';

type CompanyContext = { id: string; name: string; role: string };
const PASSWORD_RESET_REDIRECT = 'https://vbf1.github.io/kidsloc-app/';

function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const value = raw.toLowerCase();
  if (value.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (value.includes('email not confirmed')) return 'Seu e-mail ainda não foi confirmado.';
  if (value.includes('otp_expired') || value.includes('expired')) return 'O link expirou ou já foi utilizado. Solicite outro.';
  return raw || 'Não foi possível concluir a operação. Tente novamente.';
}

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
  const [companyLoading, setCompanyLoading] = useState(false);
  const [showCustomers, setShowCustomers] = useState(false);
  const feedback = useCallback((value: string, error = false) => {
    setMessage(value);
    setIsError(error);
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
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
      setLoading(false);
    };
    void initialize();
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') {
        setCompany(null);
        setShowCustomers(false);
        setRecovery(false);
        setForgot(false);
        setPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [feedback]);

  useEffect(() => {
    let active = true;
    if (!session) {
      setCompany(null);
      setCompanyLoading(false);
      return;
    }
    setCompanyLoading(true);
    void (async () => {
      try {
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
        if (active) setCompanyLoading(false);
      }
    })();
    return () => { active = false; };
  }, [session, feedback]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) return feedback('Informe seu e-mail e sua senha.', true);
    setBusy(true); feedback('Validando seu acesso...');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
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
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: PASSWORD_RESET_REDIRECT });
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
      const { error } = await supabase.auth.updateUser({ password: newPassword });
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

  if (loading) return <main className="page-shell"><section className="welcome-card"><p>Verificando sua sessão e preparando o aplicativo...</p></section></main>;

  if (recovery && session) return (
    <main className="page-shell"><section className="welcome-card auth-card">
      <div className="brand-mark">SK</div><p className="eyebrow">SONHO KIDS BRINQUEDOS</p><h1>Definir nova senha</h1>
      <form onSubmit={updatePassword} className="auth-form">
        <label htmlFor="new-password">Nova senha</label>
        <input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
        <label htmlFor="confirm-password">Confirme a nova senha</label>
        <input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} />
        <button disabled={busy} type="submit">{busy ? 'Salvando...' : 'Salvar nova senha'}</button>
      </form>
      <p className={isError ? 'feedback error' : 'feedback'} role="status">{message}</p>
    </section></main>
  );

  if (!session) return (
    <main className="page-shell"><section className="welcome-card auth-card">
      <div className="brand-mark">SK</div><p className="eyebrow">SONHO KIDS BRINQUEDOS</p><h1>KidsLoc App</h1>
      <p className="intro">Entre com a conta já cadastrada no sistema.</p>
      {forgot ? (
        <form onSubmit={requestReset} className="auth-form">
          <h2>Recuperar senha</h2><label htmlFor="email">E-mail cadastrado</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
          <button disabled={busy} type="submit">{busy ? 'Enviando...' : 'Enviar link de recuperação'}</button>
          <button className="secondary-button" type="button" onClick={() => { setForgot(false); feedback(''); }}>Voltar ao login</button>
        </form>
      ) : (
        <form onSubmit={login} className="auth-form">
          <label htmlFor="email">E-mail</label><input id="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
          <label htmlFor="password">Senha</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
          <button disabled={busy} type="submit">{busy ? 'Entrando...' : 'Entrar'}</button>
          <button className="secondary-button" type="button" onClick={() => { setForgot(true); feedback(''); }}>Esqueci minha senha</button>
        </form>
      )}
      <p className={isError ? 'feedback error' : 'feedback'} role="status">{message || 'Use seu e-mail e senha atuais.'}</p>
    </section></main>
  );

  if (companyLoading) return <main className="page-shell"><section className="welcome-card"><p>Carregando os dados da empresa...</p></section></main>;
  if (!company) return <main className="page-shell"><section className="welcome-card auth-card">
    <h1>Acesso sem empresa vinculada</h1><p className="intro">{message || 'Esta conta não está vinculada a uma empresa.'}</p>
    <button onClick={logout} disabled={busy}>Sair</button>
  </section></main>;

  if (showCustomers) return (
    <main className="module-page">
      <header className="app-topbar">
        <strong>KidsLoc App · {company.name}</strong>
        <div className="topbar-actions">
          <button type="button" className="secondary-button" onClick={() => setShowCustomers(false)}>Início</button>
          <button type="button" onClick={logout} disabled={busy}>Sair</button>
        </div>
      </header>
      <CustomersPage companyId={company.id} />
    </main>
  );

  return <main className="page-shell"><section className="welcome-card auth-card">
    <div className="brand-mark">SK</div><p className="eyebrow">SONHO KIDS BRINQUEDOS</p>
    <h1>Olá, {session.user.email?.split('@')[0] ?? 'usuário'}</h1>
    <p className="intro">Você está autenticado e vinculado à empresa <strong>{company.name}</strong>.</p>
    <div className="status"><span className="status-dot" /> Sessão ativa · Perfil: {company.role}</div>
    <button type="button" onClick={() => setShowCustomers(true)}>Gerenciar clientes</button>
    <p className="note">Os módulos estão sendo migrados gradualmente. Os dados permanecem no banco atual.</p>
    <button onClick={logout} disabled={busy}>{busy ? 'Saindo...' : 'Sair da conta'}</button>
  </section></main>;
}
