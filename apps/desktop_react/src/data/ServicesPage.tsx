import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type Service = { id: string; name: string; description: string | null; price: number; price_unit: string; active: boolean; notes: string | null; imageUrl?: string | null };
const money = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ServicesPage({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('0');
  const [unit, setUnit] = useState('fixed');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('services')
        .select('id,name,description,price,price_unit,active,notes,service_images(storage_path,is_cover)')
        .eq('company_id', companyId).order('name');
      if (error) throw error;
      const mapped = await Promise.all((data ?? []).map(async (row: any) => {
        const cover = (row.service_images ?? []).find((img: any) => img.is_cover) ?? row.service_images?.[0];
        if (!cover?.storage_path) return { ...row, imageUrl: null };
        const { data: signed } = await supabase.storage.from('product-images').createSignedUrl(cover.storage_path, 3600);
        return { ...row, imageUrl: signed?.signedUrl ?? null };
      }));
      setRows(mapped as Service[]);
      setMessage('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar os serviços.'); }
    finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  function openForm(row?: Service) {
    setEditing(row ?? null); setName(row?.name ?? ''); setDescription(row?.description ?? '');
    setPrice(String(row?.price ?? 0)); setUnit(row?.price_unit ?? 'fixed'); setNotes(row?.notes ?? '');
    setPhoto(null); setFormOpen(true); setMessage('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(price.replace(',', '.'));
    if (!name.trim() || !Number.isFinite(amount) || amount < 0) { setMessage('Informe nome e preço válidos.'); return; }
    if (photo && (!['image/jpeg','image/png','image/webp'].includes(photo.type) || photo.size > 8 * 1024 * 1024)) {
      setMessage('A foto precisa ser JPG, PNG ou WebP e ter até 8 MB.'); return;
    }
    setSaving(true);
    try {
      const values = { name: name.trim(), description: description.trim() || null, price: amount, price_unit: unit, notes: notes.trim() || null };
      let serviceId = editing?.id;
      if (serviceId) {
        const { error } = await supabase.from('services').update(values).eq('id', serviceId).eq('company_id', companyId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('services').insert({ company_id: companyId, ...values }).select('id').single();
        if (error) throw error;
        serviceId = data.id;
      }
      if (photo && serviceId) {
        const extension = photo.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${companyId}/services/${serviceId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('product-images').upload(path, photo, { contentType: photo.type, upsert: false });
        if (uploadError) throw uploadError;
        const { error: imageError } = await supabase.from('service_images').insert({
          company_id: companyId, service_id: serviceId, storage_path: path, caption: name.trim(), is_cover: true,
        });
        if (imageError) throw imageError;
      }
      setFormOpen(false); await load(); setMessage('Serviço salvo com sucesso.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar o serviço.'); }
    finally { setSaving(false); }
  }

  async function toggle(row: Service) {
    try {
      const { error } = await supabase.from('services').update({ active: !row.active }).eq('id', row.id).eq('company_id', companyId);
      if (error) throw error;
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o serviço.'); }
  }

  return <section className="module-shell">
    <header className="module-header"><div><p className="eyebrow">CATÁLOGO</p><h2>Serviços</h2><p className="module-description">Cadastre serviços separadamente dos brinquedos, com descrição, preço e foto.</p></div><button type="button" onClick={() => openForm()}>Novo serviço</button></header>
    <div className="module-toolbar"><button type="button" className="secondary-button" onClick={() => void load()}>Atualizar</button></div>
    {message && <p className="module-feedback" role="status">{message}</p>}
    {formOpen && <form className="customer-form" onSubmit={save}>
      <h3>{editing ? 'Editar serviço' : 'Cadastrar serviço'}</h3>
      <label>Nome do serviço *<input required value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Monitoria, montagem, recreação" /></label>
      <label>Descrição<textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} /></label>
      <div className="form-grid"><label>Preço (R$) *<input required inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></label><label>Forma de cobrança<select value={unit} onChange={e => setUnit(e.target.value)}><option value="fixed">Valor fixo</option><option value="hour">Por hora</option><option value="day">Por dia</option><option value="event">Por evento</option></select></label></div>
      <label>Foto do serviço<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setPhoto(e.target.files?.[0] ?? null)} /><small>JPG, PNG ou WebP · até 8 MB. Enviada ao armazenamento privado da empresa.</small></label>
      <label>Observações internas<textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar serviço'}</button></div>
    </form>}
    {loading ? <p className="module-empty">Carregando serviços...</p> : rows.length === 0 ? <p className="module-empty">Nenhum serviço cadastrado.</p> : <div className="customer-list">{rows.map(row => <article className="customer-row service-row" key={row.id}>
      {row.imageUrl ? <img className="service-thumb" src={row.imageUrl} alt={row.name} /> : <div className="customer-avatar">✦</div>}
      <div className="customer-info"><strong>{row.name}</strong><span>{row.description || 'Sem descrição'} · {money(Number(row.price))} {({fixed:'fixo',hour:'por hora',day:'por dia',event:'por evento'} as Record<string,string>)[row.price_unit] || ''}</span><small>{row.active ? 'Ativo' : 'Inativo'}</small></div>
      <button type="button" className="secondary-button" onClick={() => openForm(row)}>Editar</button><button type="button" className="secondary-button" onClick={() => void toggle(row)}>{row.active ? 'Desativar' : 'Ativar'}</button>
    </article>)}</div>}
  </section>;
}
