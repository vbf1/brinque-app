import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type Product = { id: string; name: string; description: string | null; daily_price: number };
type Ad = { id: string; product_id: string | null; title: string; description: string; keywords: string[]; image_url: string | null; image_prompt: string; platforms: string[]; status: string; created_at: string };
type Settings = { business_name: string; whatsapp: string; service_regions: string[]; default_description: string; default_call_to_action: string };
const initialSettings: Settings = { business_name: '', whatsapp: '', service_regions: ['Contagem', 'Belo Horizonte'], default_description: '', default_call_to_action: 'Chame no WhatsApp para consultar disponibilidade' };
const channels = [{id:'facebook_marketplace',label:'Facebook Marketplace'},{id:'facebook_page',label:'Página do Facebook'},{id:'facebook_groups',label:'Grupos do Facebook'},{id:'instagram',label:'Instagram'}];
const labels: Record<string,string> = {draft:'Rascunho',pending_approval:'Aguardando aprovação',approved:'Aprovado',published:'Status marcado como publicado (sem integração)',rejected:'Precisa de ajustes'};

export function MarketingPage({ companyId, userId }: { companyId: string; userId: string }) {
 const [settings,setSettings]=useState<Settings>(initialSettings);
 const [regions,setRegions]=useState('Contagem, Belo Horizonte');
 const [products,setProducts]=useState<Product[]>([]);
 const [ads,setAds]=useState<Ad[]>([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState('');
 const [tab,setTab]=useState<'ads'|'settings'>('ads');
 const [editing,setEditing]=useState<Ad|null>(null);
 const [productId,setProductId]=useState('');
 const [title,setTitle]=useState('');
 const [description,setDescription]=useState('');
 const [keywords,setKeywords]=useState('');
 const [imageUrl,setImageUrl]=useState('');
 const [imageLoadError,setImageLoadError]=useState(false);
 const [imagePrompt,setImagePrompt]=useState('');
 const [platforms,setPlatforms]=useState<string[]>(['facebook_marketplace']);
 const [filter,setFilter]=useState('all');
 const [searchTerm,setSearchTerm]=useState('');
 const [channelFilter,setChannelFilter]=useState('all');

 const load=useCallback(async()=>{
  setLoading(true);
  try{
   const [s,p,a]=await Promise.all([
    supabase.from('marketing_settings').select('*').eq('company_id',companyId).maybeSingle(),
    supabase.from('products').select('id,name,description,daily_price').eq('company_id',companyId).eq('active',true).order('name'),
    supabase.from('marketing_ads').select('*').eq('company_id',companyId).order('created_at',{ascending:false})
   ]);
   if(s.error)throw s.error;if(p.error)throw p.error;if(a.error)throw a.error;
   const x=s.data;
   const next=x?{business_name:x.business_name??'',whatsapp:x.whatsapp??'',service_regions:x.service_regions??[],default_description:x.default_description??'',default_call_to_action:x.default_call_to_action??initialSettings.default_call_to_action}:initialSettings;
   setSettings(next);setRegions(next.service_regions.join(', '));setProducts(p.data??[]);setAds(a.data??[]);setMessage('');
  }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível carregar o módulo.');}
  finally{setLoading(false);}
 },[companyId]);
 useEffect(()=>{void load();},[load]);

 function clearForm(){setEditing(null);setProductId('');setTitle('');setDescription('');setKeywords('');setImageUrl('');setImageLoadError(false);setImagePrompt('');setPlatforms(['facebook_marketplace']);}
 function generate(id:string){
  const p=products.find(v=>v.id===id);if(!p)return;
  const area=settings.service_regions.length?settings.service_regions.join(', '):'Contagem e região';
  const mainRegion=settings.service_regions[0]||'Contagem';
  const businessName=settings.business_name.trim();
  const productDetails=p.description?.trim()? 'Detalhes do brinquedo: '+p.description.trim() : '';
  setProductId(id);
  setTitle(['Aluguel de '+p.name+' em '+mainRegion,businessName].filter(Boolean).join(' | ').slice(0,180));
  setDescription([settings.default_description,businessName?businessName+' — locação de brinquedos para festas.':'',productDetails,'Leve mais diversão para sua festa com '+p.name+'.','Atendemos '+area+'.',settings.default_call_to_action+(settings.whatsapp?': '+settings.whatsapp:'')+'.'].filter(Boolean).join('\n\n'));
  setKeywords([p.name,'aluguel de brinquedos','locação de brinquedos',...settings.service_regions].join(', '));
  setImagePrompt('Fotografia publicitária realista e original de '+p.name+' para locação em festa infantil. Brinquedo em destaque, ambiente alegre, sem textos, marcas ou marcas d’água.');
 }
 function edit(ad:Ad){setEditing(ad);setProductId(ad.product_id??'');setTitle(ad.title);setDescription(ad.description);setKeywords(ad.keywords.join(', '));setImageUrl(ad.image_url??'');setImageLoadError(false);setImagePrompt(ad.image_prompt??'');setPlatforms(ad.platforms??['facebook_marketplace']);setTab('ads');}
 function duplicateAd(ad:Ad){setEditing(null);setProductId(ad.product_id??'');setTitle((ad.title+' (cópia)').slice(0,180));setDescription(ad.description);setKeywords(ad.keywords.join(', '));setImageUrl(ad.image_url??'');setImageLoadError(false);setImagePrompt(ad.image_prompt??'');setPlatforms(ad.platforms??['facebook_marketplace']);setTab('ads');setMessage('Cópia preparada como novo rascunho. Revise o conteúdo antes de salvar.');}
 async function copyAd(ad:Ad){
  const content=[ad.title,ad.description,ad.keywords.length?'Palavras-chave: '+ad.keywords.join(', '):'', 'Canais sugeridos: '+ad.platforms.map(v=>channels.find(ch=>ch.id===v)?.label??v).join(', ')].filter(Boolean).join('\n\n');
  try{
   if(navigator.clipboard?.writeText){
    await navigator.clipboard.writeText(content);
   }else{
    const fallback=document.createElement('textarea');
    fallback.value=content;
    fallback.setAttribute('readonly','');
    fallback.style.position='fixed';
    fallback.style.opacity='0';
    fallback.style.pointerEvents='none';
    document.body.appendChild(fallback);
    fallback.select();
    const copied=document.execCommand('copy');
    document.body.removeChild(fallback);
    if(!copied)throw new Error('Este navegador não permitiu copiar. Selecione e copie o texto manualmente.');
   }
   setMessage('Anúncio copiado. Revise e publique manualmente no canal escolhido.');
  }catch(e){
   setMessage(e instanceof Error?e.message:'Não foi possível copiar o anúncio. Selecione o texto e copie manualmente.');
  }
 }
 async function saveSettings(e:FormEvent){
  e.preventDefault();setSaving(true);
  try{
   const payload={company_id:companyId,...settings,service_regions:regions.split(',').map(v=>v.trim()).filter(Boolean),updated_by:userId};
   const {error}=await supabase.from('marketing_settings').upsert(payload,{onConflict:'company_id'});if(error)throw error;
   await load();setMessage('Configurações salvas e prontas para os próximos anúncios.');
  }catch(e){setMessage(e instanceof Error?e.message:'Falha ao salvar configurações.');}
  finally{setSaving(false);}
 }
 async function saveAd(e:Pick<FormEvent,'preventDefault'>,send:boolean){
  e.preventDefault();
  if(title.trim().length<5||description.trim().length<10){setMessage('Preencha um título e uma descrição completos.');return;}
  if(!platforms.length){setMessage('Selecione pelo menos um canal.');return;}
  const normalizedImageUrl=imageUrl.trim();
  if(normalizedImageUrl){
   try{const parsedUrl=new URL(normalizedImageUrl);if(!['http:','https:'].includes(parsedUrl.protocol))throw new Error();}
   catch{setMessage('Informe um link de imagem válido começando com http:// ou https://.');return;}
  }
  setSaving(true);
  try{
   const payload={company_id:companyId,product_id:productId||null,title:title.trim(),description:description.trim(),keywords:keywords.split(',').map(v=>v.trim()).filter(Boolean),image_url:normalizedImageUrl||null,image_prompt:imagePrompt.trim(),platforms,status:send?'pending_approval':'draft',created_by:userId};
   const result=editing?await supabase.from('marketing_ads').update({product_id:payload.product_id,title:payload.title,description:payload.description,keywords:payload.keywords,image_url:payload.image_url,image_prompt:payload.image_prompt,platforms:payload.platforms,status:payload.status,approved_by:null,approved_at:null,approval_note:null,published_at:null}).eq('id',editing.id).eq('company_id',companyId):await supabase.from('marketing_ads').insert(payload);
   if(result.error)throw result.error;
   clearForm();await load();setMessage(send?'Anúncio enviado para revisão.':'Rascunho salvo.');
  }catch(e){setMessage(e instanceof Error?e.message:'Falha ao salvar anúncio.');}
  finally{setSaving(false);}
 }
 async function status(ad:Ad,next:'pending_approval'|'approved'|'rejected'){
  const patch:any={status:next,approval_note:next==='rejected'?'Revise o conteúdo antes de enviar novamente.':null,approved_by:next==='approved'?userId:null,approved_at:next==='approved'?new Date().toISOString():null};
  const {error}=await supabase.from('marketing_ads').update(patch).eq('id',ad.id).eq('company_id',companyId);
  if(error)setMessage(error.message);else{await load();setMessage(next==='approved'?'Anúncio aprovado. Nenhuma publicação foi realizada.':'Status atualizado.');}
 }
 async function remove(ad:Ad){
  if(!window.confirm('Excluir este anúncio?'))return;
  const {error}=await supabase.from('marketing_ads').delete().eq('id',ad.id).eq('company_id',companyId);
  if(error)setMessage(error.message);else{await load();setMessage('Anúncio excluído.');}
 }
 const visible=useMemo(()=>{
  const term=searchTerm.trim().toLocaleLowerCase('pt-BR');
  return ads.filter(a=>{
   const matchesStatus=filter==='all'||a.status===filter;
   const matchesChannel=channelFilter==='all'||a.platforms.includes(channelFilter);
   const searchable=[a.title,a.description,...a.keywords].join(' ').toLocaleLowerCase('pt-BR');
   return matchesStatus&&matchesChannel&&(!term||searchable.includes(term));
  });
 },[ads,filter,channelFilter,searchTerm]);
 const selected=products.find(p=>p.id===productId);
 return <section className="module-shell marketing-module">
  <header className="module-header"><div><p className="eyebrow">DIVULGAÇÃO DA EMPRESA</p><h2>Marketing e anúncios</h2><p className="module-description">Prepare anúncios, revise o conteúdo e aprove antes de qualquer publicação.</p><p className="marketing-manual-note">A publicação automática ainda não está conectada. Depois da aprovação, copie o conteúdo e publique manualmente na plataforma escolhida.</p></div><button type="button" onClick={()=>{clearForm();setTab('ads');}}>＋ Novo anúncio</button></header>
  <div className="marketing-tabs"><button type="button" className={tab==='ads'?'active':''} onClick={()=>setTab('ads')}>Anúncios</button><button type="button" className={tab==='settings'?'active':''} onClick={()=>setTab('settings')}>Configurações fixas</button></div>
  {message&&<p className="module-feedback" role="status">{message}</p>}
  {tab==='settings'?<form className="customer-form marketing-settings" onSubmit={saveSettings}>
   <h3>Informações padrão da empresa</h3><p className="module-description">Essas informações serão reaproveitadas na preparação de novos anúncios.</p>
   <label>Nome comercial<input value={settings.business_name} onChange={e=>setSettings({...settings,business_name:e.target.value})} placeholder="Nome da loja"/></label>
   <label>WhatsApp<input value={settings.whatsapp} onChange={e=>setSettings({...settings,whatsapp:e.target.value})} placeholder="(31) 99999-9999"/></label>
   <label>Cidades e regiões atendidas<input value={regions} onChange={e=>setRegions(e.target.value)} placeholder="Contagem, Belo Horizonte, Betim..."/><small>Separe as regiões por vírgula.</small></label>
   <label>Descrição padrão<textarea rows={4} value={settings.default_description} onChange={e=>setSettings({...settings,default_description:e.target.value})} placeholder="Informações sobre a empresa, entrega, montagem e diferenciais."/></label>
   <label>Chamada para ação<input value={settings.default_call_to_action} onChange={e=>setSettings({...settings,default_call_to_action:e.target.value})}/></label>
   <div className="form-actions"><button type="submit" disabled={saving}>{saving?'Salvando...':'Salvar configurações'}</button></div>
  </form>:<>
   <div className="marketing-summary"><div><strong>{ads.length}</strong><span>Total</span></div><div><strong>{ads.filter(a=>a.status==='draft').length}</strong><span>Rascunhos</span></div><div><strong>{ads.filter(a=>a.status==='pending_approval').length}</strong><span>Para revisar</span></div><div><strong>{ads.filter(a=>a.status==='approved').length}</strong><span>Aprovados</span></div></div>
   <div className="marketing-toolbar marketing-toolbar-filters"><input aria-label="Pesquisar anúncios" type="search" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Pesquisar por título, descrição ou palavra-chave..."/><select aria-label="Filtrar por status" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todos os status</option>{Object.entries(labels).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select><select aria-label="Filtrar por canal" value={channelFilter} onChange={e=>setChannelFilter(e.target.value)}><option value="all">Todos os canais</option>{channels.map(c=><option value={c.id} key={c.id}>{c.label}</option>)}</select><button type="button" className="secondary-button" onClick={()=>{setSearchTerm('');setFilter('all');setChannelFilter('all');}}>Limpar filtros</button><button type="button" className="secondary-button" onClick={()=>void load()}>Atualizar</button></div>
   {loading?<p className="module-empty">Carregando anúncios...</p>:visible.length===0?<p className="module-empty">{ads.length===0?'Nenhum anúncio cadastrado. Crie o primeiro usando um brinquedo do estoque.':'Nenhum anúncio corresponde aos filtros atuais. Tente outro termo ou limpe os filtros.'}</p>:<><p className="marketing-results-count">Exibindo {visible.length} de {ads.length} anúncios</p><div className="marketing-ad-list">{visible.map(ad=><article className="marketing-ad-card" key={ad.id}>
    {ad.image_url?<img src={ad.image_url} alt="Imagem do anúncio"/>:<div className="marketing-image-placeholder">Imagem ainda não adicionada</div>}
    <div className="marketing-ad-content"><div className="marketing-ad-top"><span className={'marketing-status status-'+ad.status}>{labels[ad.status]??ad.status}</span><small>{new Date(ad.created_at).toLocaleDateString('pt-BR')}</small></div><h3>{ad.title}</h3><p>{ad.description}</p><div className="marketing-tags">{ad.platforms.map(v=><span key={v}>{channels.find(c=>c.id===v)?.label??v}</span>)}</div><small>Palavras-chave: {ad.keywords.join(', ')||'Não informadas'}</small>
    <div className="marketing-actions"><button type="button" className="secondary-button" onClick={()=>void copyAd(ad)}>Copiar anúncio</button><button type="button" className="secondary-button" onClick={()=>edit(ad)}>Editar</button><button type="button" className="secondary-button" onClick={()=>duplicateAd(ad)}>Duplicar</button>{ad.status==='draft'||ad.status==='rejected'?<button type="button" onClick={()=>void status(ad,'pending_approval')}>Enviar para revisão</button>:null}{ad.status==='pending_approval'?<><button type="button" onClick={()=>void status(ad,'approved')}>Aprovar</button><button type="button" className="secondary-button" onClick={()=>void status(ad,'rejected')}>Solicitar ajustes</button></>:null}{ad.status==='approved'?<span className="marketing-not-published">Aprovado · publicação não conectada</span>:null}<button type="button" className="danger-button" onClick={()=>void remove(ad)}>Excluir</button></div>
    </div></article>)}</div></>}
   <form className="customer-form marketing-editor" onSubmit={e=>void saveAd(e,false)}>
    <h3>{editing?'Editar anúncio':'Preparar anúncio'}</h3><p className="module-description">Selecione um brinquedo para preencher uma primeira versão. Você pode revisar todos os campos antes de salvar.</p>
    <label>Brinquedo do estoque<select value={productId} onChange={e=>generate(e.target.value)}><option value="">Selecione um brinquedo</option>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
    {selected&&<p className="marketing-product-hint">Preço cadastrado: R$ {Number(selected.daily_price).toFixed(2)} por diária. O preço não será publicado automaticamente.</p>}
    <label>Título *<input required minLength={5} maxLength={180} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Título do anúncio"/></label>
    <label>Descrição *<textarea required minLength={10} maxLength={5000} rows={6} value={description} onChange={e=>setDescription(e.target.value)}/></label>
    <label>Palavras-chave (separadas por vírgula)<input value={keywords} onChange={e=>setKeywords(e.target.value)}/></label>
    <label>Link da imagem (opcional)<input type="url" value={imageUrl} onChange={e=>{setImageUrl(e.target.value);setImageLoadError(false);}} placeholder="https://..."/></label>
    <label>Orientação para produzir a imagem<textarea rows={3} value={imagePrompt} onChange={e=>setImagePrompt(e.target.value)} placeholder="Descreva a imagem que deverá acompanhar o anúncio."/></label>
    <fieldset className="marketing-channel-field"><legend>Canais desejados</legend>{channels.map(c=><label className="marketing-check" key={c.id}><input type="checkbox" checked={platforms.includes(c.id)} onChange={e=>setPlatforms(e.target.checked?[...platforms,c.id]:platforms.filter(v=>v!==c.id))}/>{c.label}</label>)}</fieldset>
    <div className="form-actions"><button type="button" className="secondary-button" onClick={clearForm}>Limpar</button><button type="submit" disabled={saving}>{saving?'Salvando...':'Salvar rascunho'}</button><button type="button" disabled={saving} onClick={()=>void saveAd({preventDefault:()=>{}} as FormEvent,true)}>{saving?'Aguarde...':'Enviar para aprovação'}</button></div>
    <section className="marketing-preview" aria-label="Prévia do anúncio">
     <div className="marketing-preview-heading"><div><span>VISUALIZAÇÃO</span><h4>Prévia do anúncio</h4></div><small>Prévia aproximada · confira no canal antes de publicar</small></div>
     <article className="marketing-preview-card">
      <div className="marketing-preview-brand"><span className="marketing-preview-avatar">{(settings.business_name.trim()||'K').slice(0,1).toUpperCase()}</span><div><strong>{settings.business_name.trim()||'Nome da empresa'}</strong><small>{platforms.map(v=>channels.find(c=>c.id===v)?.label??v).join(' · ')||'Nenhum canal selecionado'}</small></div></div>
      {imageUrl.trim()&&!imageLoadError?<img className="marketing-preview-image" src={imageUrl.trim()} alt={selected?.name? 'Imagem de '+selected.name:'Imagem do anúncio'} onError={()=>setImageLoadError(true)}/>:<div className="marketing-preview-image marketing-preview-no-image"><span>{imageLoadError?'Não foi possível carregar a imagem':'Imagem do anúncio'}</span><small>{imageLoadError?'Confira o link ou escolha outra imagem.':'Adicione um link de imagem para visualizar aqui'}</small></div>}
      <div className="marketing-preview-copy">
       <strong>{title.trim()||'Título do anúncio'}</strong>
       <p>{description.trim()||'A descrição do anúncio aparecerá aqui enquanto você preenche o formulário.'}</p>
       {keywords.trim()&&<small>#{keywords.split(',').map(v=>v.trim()).filter(Boolean).join(' #')}</small>}
       {(settings.default_call_to_action.trim()||settings.whatsapp.trim())&&<div className="marketing-preview-cta"><strong>{settings.default_call_to_action.trim()||'Entre em contato'}</strong>{settings.whatsapp.trim()&&<span>WhatsApp: {settings.whatsapp.trim()}</span>}</div>}
      </div>
     </article>
     <div className="marketing-preview-count"><span>Título: {title.length}/180 caracteres</span><span>Descrição: {description.length}/5000 caracteres</span></div>
    </section>
   </form>
  </>}
 </section>;
}
