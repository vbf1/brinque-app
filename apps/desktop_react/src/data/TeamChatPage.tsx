import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type Member = { user_id: string; name: string; role: string };
type Conversation = { id: string; conversation_type: string; title: string | null; created_at: string };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };

export function TeamChatPage({ companyId }: { companyId: string }) {
  const userId = supabase.auth.getUser ? undefined : undefined;
  const [viewerId, setViewerId] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [recipient, setRecipient] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const messageArea = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async (uid: string) => {
    const { data: rows, error } = await supabase.from('team_conversations')
      .select('id, conversation_type, title, created_at').eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const ids = (rows ?? []).map(row => row.id);
    if (!ids.length) { setConversations([]); return; }
    const { data: memberships, error: memberError } = await supabase.from('team_conversation_members')
      .select('conversation_id, user_id').in('conversation_id', ids);
    if (memberError) throw memberError;
    const mine = new Set((memberships ?? []).filter(row => row.user_id === uid).map(row => row.conversation_id));
    setConversations((rows ?? []).filter(row => mine.has(row.id)) as Conversation[]);
  }, [companyId]);

  const load = useCallback(async () => {
    setLoading(true); setMessage('');
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Sua sessão expirou. Entre novamente.');
      setViewerId(auth.user.id);
      const { data: groupId, error: groupError } = await supabase.rpc('ensure_team_group', { p_company_id: companyId });
      if (groupError) throw groupError;
      const { data: memberRows, error: memberError } = await supabase.from('company_members')
        .select('user_id, role').eq('company_id', companyId);
      if (memberError) throw memberError;
      const ids = (memberRows ?? []).map(row => row.user_id);
      const { data: profiles, error: profileError } = ids.length
        ? await supabase.from('profiles').select('id, full_name').in('id', ids)
        : { data: [], error: null };
      if (profileError) throw profileError;
      const names = new Map((profiles ?? []).map(row => [row.id, row.full_name || 'Funcionário']));
      setMembers((memberRows ?? []).map(row => ({ user_id: row.user_id, role: row.role, name: names.get(row.user_id) || 'Funcionário' })));
      await loadConversations(auth.user.id);
      if (groupId) setActive(current => current?.id === groupId ? current : null);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar as conversas.'); }
    finally { setLoading(false); }
  }, [companyId, loadConversations]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!active) { setMessages([]); return; }
    let alive = true;
    const fetchMessages = async () => {
      const { data, error } = await supabase.from('team_messages')
        .select('id, conversation_id, sender_id, body, created_at')
        .eq('conversation_id', active.id).order('created_at', { ascending: true }).limit(300);
      if (!alive) return;
      if (error) setMessage(error.message);
      else setMessages((data ?? []) as Message[]);
    };
    const channel = supabase.channel('kidsloc-team-' + active.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages', filter: 'conversation_id=eq.' + active.id }, () => { void fetchMessages(); })
      .subscribe(status => { if (status === 'SUBSCRIBED') void fetchMessages(); });
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, [active]);
  useEffect(() => { if (messageArea.current) messageArea.current.scrollTop = messageArea.current.scrollHeight; }, [messages]);

  async function startDirect() {
    if (!recipient || !viewerId) return;
    setSending(true); setMessage('');
    try {
      const { data: created, error } = await supabase.from('team_conversations')
        .insert({ company_id: companyId, conversation_type: 'direct', title: 'Conversa', created_by: viewerId })
        .select('id, conversation_type, title, created_at').single();
      if (error) throw error;
      const ids = [...new Set([viewerId, recipient])];
      const { error: addError } = await supabase.from('team_conversation_members')
        .insert(ids.map(user_id => ({ conversation_id: created.id, company_id: companyId, user_id })));
      if (addError) throw addError;
      await loadConversations(viewerId);
      setActive(created as Conversation);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível iniciar a conversa.'); }
    finally { setSending(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !active || !viewerId) return;
    setSending(true);
    try {
      const { error } = await supabase.from('team_messages').insert({
        conversation_id: active.id, company_id: companyId, sender_id: viewerId, body,
      });
      if (error) throw error;
      setDraft('');
      await loadConversations(viewerId);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.'); }
    finally { setSending(false); }
  }

  const memberName = (id: string) => members.find(member => member.user_id === id)?.name || 'Membro da equipe';
  const conversationName = (conversation: Conversation) => {
    if (conversation.conversation_type === 'team') return 'Grupo da equipe';
    const member = conversations.find(item => item.id === conversation.id);
    return member ? (conversation.title || 'Conversa privada') : 'Conversa';
  };

  return <section className="module-content team-chat-page">
    <div className="module-header"><div><h2>Mensagens da equipe</h2><p>Converse com os funcionários e com todo o time.</p></div>
      <button type="button" className="secondary-button" onClick={() => void load()}>Atualizar</button></div>
    {message && <p className="module-feedback" role="status">{message}</p>}
    {loading ? <p className="module-empty">Carregando conversas...</p> : <div className="team-chat-layout">
      <aside className="team-chat-sidebar">
        <button type="button" className="team-group-button" onClick={async () => {
          const { data, error } = await supabase.rpc('ensure_team_group', { p_company_id: companyId });
          if (error) setMessage(error.message);
          else { const found = conversations.find(item => item.id === data); if (found) setActive(found); else { await loadConversations(viewerId); const { data: row } = await supabase.from('team_conversations').select('id, conversation_type, title, created_at').eq('id', data).single(); if (row) setActive(row as Conversation); } }
        }}>👥 Abrir grupo da equipe</button>
        <div className="team-direct-start"><label htmlFor="team-recipient">Nova conversa privada</label>
          <select id="team-recipient" value={recipient} onChange={event => setRecipient(event.target.value)}>
            <option value="">Selecione alguém da equipe</option>
            {members.filter(member => member.user_id !== viewerId).map(member => <option key={member.user_id} value={member.user_id}>{member.name} · {member.role}</option>)}
          </select>
          <button type="button" disabled={!recipient || sending} onClick={() => void startDirect()}>Iniciar conversa</button>
        </div>
        <h3>Conversas</h3>
        {conversations.map(conversation => <button type="button" key={conversation.id} className={'team-chat-list-item' + (active?.id === conversation.id ? ' active' : '')} onClick={() => setActive(conversation)}>
          <strong>{conversationName(conversation)}</strong><small>{conversation.conversation_type === 'team' ? 'Mensagens para toda a equipe' : 'Conversa privada'}</small>
        </button>)}
        {!conversations.length && <p className="module-empty">Nenhuma conversa encontrada.</p>}
      </aside>
      <div className="team-chat-panel">
        {active ? <>
          <header><strong>{conversationName(active)}</strong><small>{active.conversation_type === 'team' ? 'Mensagens visíveis para toda a equipe' : 'Conversa privada'}</small></header>
          <div className="team-chat-message-list" ref={messageArea}>
            {messages.map(item => <article key={item.id} className={'team-chat-message' + (item.sender_id === viewerId ? ' mine' : '')}>
              {item.sender_id !== viewerId && <b>{memberName(item.sender_id)}</b>}
              <p>{item.body}</p><time>{new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>
            </article>)}
            {!messages.length && <p className="module-empty">Nenhuma mensagem ainda. Envie a primeira!</p>}
          </div>
          <form className="team-chat-compose" onSubmit={send}>
            <textarea value={draft} maxLength={4000} rows={2} placeholder="Digite uma mensagem..." onChange={event => setDraft(event.target.value)} />
            <button type="submit" disabled={!draft.trim() || sending}>{sending ? 'Enviando...' : 'Enviar'}</button>
          </form>
        </> : <div className="module-empty">Selecione uma conversa ou abra o grupo da equipe.</div>}
      </div>
    </div>}
  </section>;
}
