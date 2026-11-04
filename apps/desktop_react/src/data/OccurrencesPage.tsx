import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type Photo = { id: string; storage_path: string; url: string };
type Occurrence = {
  id: string; company_id: string; created_by: string; created_by_name: string;
  title: string; category: string; severity: string; occurred_at: string;
  location: string; description: string; loss_amount: number | string; created_at: string;
  photos: Photo[];
};
const CATEGORIES = ['Quebra de brinquedo', 'Prejuízo financeiro', 'Dano material', 'Problema na entrega', 'Problema durante evento', 'Acidente ou segurança', 'Outro'];
const SEVERITIES = [{ value: 'low', label: 'Baixa' }, { value: 'medium', label: 'Moderada' }, { value: 'high', label: 'Alta' }, { value: 'critical', label: 'Crítica' }];
const emptyForm = { title: '', category: CATEGORIES[0], severity: 'medium', occurred_at: '', location: '', description: '', loss_amount: '' };
const dateInput = (value?: string) => {
  const date = value ? new Date(value) : new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const dateLabel = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const money = (value: unknown) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function OccurrencesPage({ companyId, role }: { companyId: string; role: string }) {
  const [rows, setRows] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [editing, setEditing] = useState<Occurrence | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState<File[]>([]);
  const isAdmin = role === 'owner' || role === 'admin';

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    setCurrentUserId(auth.user?.id ?? '');
    setLoading(true); setError('');
    try {
      const [{ data, error: reportError }, { data: photoRows, error: photoError }] = await Promise.all([
        supabase.from('occurrence_reports').select('*').eq('company_id', companyId).order('occurred_at', { ascending: false }),
        supabase.from('occurrence_photos').select('id, occurrence_id, storage_path').eq('company_id', companyId).order('created_at'),
      ]);
      if (reportError) throw reportError;
      if (photoError) throw photoError;
      const photos = photoRows ?? [];
      const signed = photos.length
        ? await supabase.storage.from('occurrence-photos').createSignedUrls(photos.map((photo) => photo.storage_path), 86400)
        : { data: [], error: null };
      if (signed.error) throw signed.error;
      const urls = new Map((signed.data ?? []).map((item) => [item.path, item.signedUrl ?? '']));
      setRows((data ?? []).map((item) => ({
        ...item,
        photos: photos.filter((photo) => photo.occurrence_id === item.id).map((photo) => ({
          id: photo.id, storage_path: photo.storage_path, url: urls.get(photo.storage_path) ?? '',
        })),
      })) as Occurrence[]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar as ocorrências.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [companyId]);

  const visible = useMemo(() => rows.filter((item) => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    const matches = !term || [item.title, item.location, item.created_by_name, item.description].some((v) => String(v ?? '').toLocaleLowerCase('pt-BR').includes(term));
    return matches && (!categoryFilter || item.category === categoryFilter) && (!severityFilter || item.severity === severityFilter);
  }), [rows, search, categoryFilter, severityFilter]);

  function open(item?: Occurrence) {
    setEditing(item ?? null);
    setShowForm(true);
    setForm(item ? {
      title: item.title, category: item.category, severity: item.severity,
      occurred_at: dateInput(item.occurred_at), location: item.location,
      description: item.description, loss_amount: String(item.loss_amount ?? ''),
    } : { ...emptyForm, occurred_at: dateInput() });
    setFiles([]);
    setError('');
  }
  function canManage(item: Occurrence) { return isAdmin || item.created_by === currentUserId; }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (form.title.trim().length < 3 || !form.occurred_at || form.location.trim().length < 2 || form.description.trim().length < 5 || Number(form.loss_amount || 0) < 0) {
      setError('Preencha título, data, local e descrição corretamente.'); return;
    }
    if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)) {
      setError('Cada foto deve ser JPG, PNG ou WEBP e ter no máximo 8 MB.'); return;
    }
    setBusy(true); setError('');
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Sua sessão expirou. Entre novamente.');
      const payload = {
        title: form.title.trim(), category: form.category, severity: form.severity,
        occurred_at: new Date(form.occurred_at).toISOString(), location: form.location.trim(),
        description: form.description.trim(), loss_amount: Number(form.loss_amount || 0),
      };
      let occurrenceId = editing?.id;
      if (editing) {
        if (!isAdmin && editing.created_by !== auth.user.id) throw new Error('Você não tem permissão para editar este relato.');
        const { data, error: updateError } = await supabase.from('occurrence_reports')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editing.id).eq('company_id', companyId).select('id').maybeSingle();
        if (updateError) throw updateError;
        if (!data) throw new Error('Você não tem permissão para editar este relato.');
      } else {
        const fullName = String(auth.user.user_metadata?.full_name || auth.user.user_metadata?.name || '').trim();
        const { data, error: insertError } = await supabase.from('occurrence_reports').insert({
          ...payload, company_id: companyId, created_by: auth.user.id,
          created_by_name: fullName || auth.user.email?.split('@')[0] || 'Usuário',
          created_by_email: auth.user.email ?? null,
        }).select('id').single();
        if (insertError) throw insertError;
        occurrenceId = data.id;
      }
      for (const file of files) {
        const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
        const path = companyId + '/' + occurrenceId + '/' + crypto.randomUUID() + '.' + ext;
        const { error: uploadError } = await supabase.storage.from('occurrence-photos').upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        const { error: metaError } = await supabase.from('occurrence_photos').insert({
          company_id: companyId, occurrence_id: occurrenceId, storage_path: path, uploaded_by: auth.user.id,
        });
        if (metaError) {
          await supabase.storage.from('occurrence-photos').remove([path]);
          throw metaError;
        }
      }
      setEditing(null); setShowForm(false); setFiles([]); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar a ocorrência.'); }
    finally { setBusy(false); }
  }

  async function removePhoto(photo: Photo) {
    if (!editing || !window.confirm('Excluir esta foto da ocorrência?')) return;
    setBusy(true); setError('');
    try {
      const { error: storageError } = await supabase.storage.from('occurrence-photos').remove([photo.storage_path]);
      if (storageError) throw storageError;
      const { error: rowError } = await supabase.from('occurrence_photos').delete().eq('id', photo.id).eq('company_id', companyId);
      if (rowError) throw rowError;
      await load();
      const refreshed = rows.find((row) => row.id === editing.id);
      if (refreshed) setEditing({ ...refreshed, photos: refreshed.photos.filter((item) => item.id !== photo.id) });
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível excluir a foto.'); }
    finally { setBusy(false); }
  }

  async function remove(item: Occurrence) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user || (!isAdmin && item.created_by !== auth.user.id)) { setError('Você não tem permissão para excluir este relato.'); return; }
    if (!window.confirm('Excluir esta ocorrência e todas as fotos anexadas permanentemente?')) return;
    setBusy(true); setError('');
    try {
      if (item.photos.length) {
        const { error: storageError } = await supabase.storage.from('occurrence-photos').remove(item.photos.map((photo) => photo.storage_path));
        if (storageError) throw storageError;
      }
      const { error: deleteError } = await supabase.from('occurrence_reports').delete().eq('id', item.id).eq('company_id', companyId);
      if (deleteError) throw deleteError;
      setEditing(null); setShowForm(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível excluir a ocorrência.'); }
    finally { setBusy(false); }
  }

  return <section className="data-page">
    <div className="data-page-heading"><div><p className="eyebrow">REGISTROS OPERACIONAIS</p><h1>Ocorrências</h1><p>Relatos, gravidade, prejuízos e evidências em um só lugar.</p></div>
      <button type="button" onClick={() => open()}>＋ Novo relato</button></div>
    {error && <p className="feedback error" role="alert">{error}</p>}
    {showForm ? (
      <form className="data-form" onSubmit={save}>
        <h2>{editing ? 'Detalhes da ocorrência' : 'Novo relato de ocorrência'}</h2>
        <label>Título<input disabled={!!editing && !canManage(editing)} maxLength={140} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
        <label>Categoria<select disabled={!!editing && !canManage(editing)} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Gravidade<select disabled={!!editing && !canManage(editing)} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>{SEVERITIES.map((value) => <option key={value.value} value={value.value}>{value.label}</option>)}</select></label>
        <label>Data e horário<input disabled={!!editing && !canManage(editing)} type="datetime-local" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} required /></label>
        <label>Local<input disabled={!!editing && !canManage(editing)} maxLength={240} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required /></label>
        <label>Descrição<textarea disabled={!!editing && !canManage(editing)} rows={5} maxLength={6000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></label>
        <label>Prejuízo estimado (R$), opcional<input disabled={!!editing && !canManage(editing)} type="number" min="0" step="0.01" value={form.loss_amount} onChange={(e) => setForm({ ...form, loss_amount: e.target.value })} /></label>
        {(!editing || canManage(editing)) && <label>Fotos e evidências (JPG, PNG ou WEBP; até 8 MB por foto)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></label>}
        {editing?.photos.map((photo) => <div className="data-row-actions" key={photo.id}><a href={photo.url} target="_blank" rel="noreferrer">Abrir foto</a>{editing && canManage(editing) && <button type="button" className="danger-button" disabled={busy} onClick={() => void removePhoto(photo)}>Excluir foto</button>}</div>)}
        <div className="data-form-actions">{(!editing || canManage(editing)) && <button disabled={busy} type="submit">{busy ? 'Salvando...' : 'Salvar ocorrência'}</button>}<button type="button" className="secondary-button" onClick={() => { setEditing(null); setShowForm(false); setForm(emptyForm); setFiles([]); }}>Fechar</button>
          {editing && canManage(editing) && <button type="button" className="danger-button" disabled={busy} onClick={() => void remove(editing)}>Excluir ocorrência</button>}
        </div>
      </form>
    ) : null}
    <div className="data-toolbar"><input aria-label="Buscar ocorrências" placeholder="Buscar título, local ou responsável..." value={search} onChange={(e) => setSearch(e.target.value)} />
      <select aria-label="Filtrar categoria" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="">Todas as categorias</option>{CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Filtrar gravidade" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}><option value="">Todas as gravidades</option>{SEVERITIES.map((value) => <option key={value.value} value={value.value}>{value.label}</option>)}</select></div>
    {loading ? <p>Carregando ocorrências...</p> : visible.length ? <div className="data-list">{visible.map((item) => <article className="data-list-row occurrence-row" key={item.id}>
      <div><strong>{item.title}</strong><span>{dateLabel(item.occurred_at)} · {item.location}</span><span>{item.category} · {SEVERITIES.find((value) => value.value === item.severity)?.label ?? 'Moderada'} · Relatado por {item.created_by_name}</span>
        {Number(item.loss_amount) > 0 && <span>Prejuízo estimado: {money(item.loss_amount)}</span>}<span>{item.description}</span><span>{item.photos.length} foto(s) anexada(s)</span></div>
      <button type="button" className="secondary-button" onClick={() => open(item)}>Detalhes</button>
    </article>)}</div> : <p className="empty-state">Nenhuma ocorrência encontrada.</p>}
  </section>;
}
