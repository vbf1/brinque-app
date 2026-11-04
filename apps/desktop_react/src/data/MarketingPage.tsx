import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type Product = { id: string; name: string; description: string | null; daily_price: number };
type ProductImage = { id: string; product_id: string; storage_path: string; caption: string; is_cover: boolean; product_name: string; signed_url: string | null };
type Ad = { id: string; product_id: string | null; title: string; description: string; keywords: string[]; image_url: string | null; image_prompt: string; platforms: string[]; status: string; approval_note: string | null; created_at: string; image_display_url?: string | null };
type Settings = { business_name: string; whatsapp: string; service_regions: string[]; default_description: string; default_call_to_action: string };
const initialSettings: Settings = { business_name: '', whatsapp: '', service_regions: ['Contagem', 'Belo Horizonte'], default_description: '', default_call_to_action: 'Chame no WhatsApp para consultar disponibilidade' };
const channels = [{id:'facebook_marketplace',label:'Facebook Marketplace'},{id:'facebook_page',label:'Página do Facebook'},{id:'facebook_groups',label:'Grupos do Facebook'},{id:'instagram',label:'Instagram'}];
const labels: Record<string,string> = {draft:'Rascunho',pending_approval:'Aguardando aprovação',approved:'Aprovado',published:'Status marcado como publicado (sem integração)',rejected:'Precisa de ajustes'};
const PRODUCT_IMAGE_PREFIX = 'product-image:';
const BRANDING_BUCKET = 'company-branding';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function managedBrandingPath(url: string | null, companyId: string): string | null {
 if (!url) return null;
 const marker = `/storage/v1/object/public/${BRANDING_BUCKET}/`;
 const position = url.indexOf(marker);
 if (position < 0) return null;
 const path = decodeURIComponent(url.slice(position + marker.length).split('?')[0]);
 return path.startsWith(`${companyId}/marketing/`) ? path : null;
}

export function MarketingPage({ companyId, userId }: { companyId: string; userId: string }) {
 const [settings,setSettings]=useState<Settings>(initialSettings);
 const [regions,setRegions]=useState('Contagem, Belo Horizonte');
 const [products,setProducts]=useState<Product[]>([]);
 const [productImages,setProductImages]=useState<ProductImage[]>([]);
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
 const [imagePrompt,setImagePrompt]=useState('');
 const [imageFile,setImageFile]=useState<File|null>(null);
 const [imagePreview,setImagePreview]=useState('');
 const [selectedProductImagePath,setSelectedProductImagePath]=useState('');
 const [platforms,setPlatforms]=useState<string[]>(['facebook_marketplace']);
 const [filter,setFilter]=useState('all');
 const [previewChannel,setPreviewChannel]=useState('instagram');

 useEffect(()=>{
  if(!imageFile){setImagePreview('');return;}
  const url=URL.createObjectURL(imageFile);setImagePreview(url);
  return ()=>URL.revokeObjectURL(url);
 },[imageFile]);

 const load=useCallback(async()=>{
  setLoading(true);
  try{
   const [s,p,a,pi]=await Promise.all([
    supabase.from('marketing_settings').select('*').eq('company_id',companyId).maybeSingle(),
    supabase.from('products').select('id,name,description,daily_price').eq('company_id',companyId).eq('active',true).order('name'),
    supabase.from('marketing_ads').select('*').eq('company_id',companyId).order('created_at',{ascending:false}),
    supabase.from('product_images').select('id,product_id,storage_path,caption,is_cover').eq('company_id',companyId).order('is_cover',{ascending:false})
   ]);
   if(s.error)throw s.error;if(p.error)throw p.error;if(a.error)throw a.error;if(pi.error)throw pi.error;
   const nextSettings=s.data?{business_name:s.data.business_name??'',whatsapp:s.data.whatsapp??'',service_regions:s.data.service_regions??[],default_description:s.data.default_description??'',default_call_to_action:s.data.default_call_to_action??initialSettings.default_call_to_action}:initialSettings;
   const productNames=new Map<string,string>((p.data??[]).map((item:Product)=>[item.id,item.name] as [string,string]));
   const mappedImages=await Promise.all((pi.data??[]).map(async(row:any)=>{
    const result=await supabase.storage.from('product-images').createSignedUrl(row.storage_path,3600);
    return {...row,product_name:productNames.get(row.product_id)??'Brinquedo',signed_url:result.data?.signedUrl??null};
   }));
   const mappedAds=await Promise.all((a.data??[]).map(async(row:Ad)=>{
    if(row.image_url?.startsWith(PRODUCT_IMAGE_PREFIX)){
     const path=row.image_url.slice(PRODUCT_IMAGE_PREFIX.length);
     const result=await supabase.storage.from('product-images').createSignedUrl(path,3600);
     return {...row,image_display_url:result.data?.signedUrl??null};
    }
    return {...row,image_display_url:row.image_url};
   }));
   setSettings(nextSettings);setRegions(nextSettings.service_regions.join(', '));setProducts(p.data??[]);setProductImages(mappedImages);setAds(mappedAds);setMessage('');
  }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível carregar o módulo.');}
  finally{setLoading(false);}
 },[companyId]);
 useEffect(()=>{void load();},[load]);

 function clearForm(){
  setEditing(null);setProductId('');setTitle('');setDescription('');setKeywords('');setImageUrl('');setImagePrompt('');setImageFile(null);setSelectedProductImagePath('');setPlatforms(['facebook_marketplace']);
 }
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
 function edit(ad:Ad){
  setEditing(ad);setProductId(ad.product_id??'');setTitle(ad.title);setDescription(ad.description);setKeywords(ad.keywords.join(', '));setImagePrompt(ad.image_prompt??'');setPlatforms(ad.platforms??['facebook_marketplace']);setTab('ads');setImageFile(null);
  if(ad.image_url?.startsWith(PRODUCT_IMAGE_PREFIX)){setSelectedProductImagePath(ad.image_url.slice(PRODUCT_IMAGE_PREFIX.length));setImageUrl('');}
  else{setSelectedProductImagePath('');setImageUrl(ad.image_url??'');}
 }
 async function copyAd(ad:Ad,channel:'instagram'|'facebook'){
  const tags=ad.keywords.map(value=>'#'+value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/[^a-zA-Z0-9]+/g,'')).filter(tag=>tag.length>1).slice(0,12).join(' ');
  const content=channel==='instagram'?[ad.title,ad.description,tags].filter(Boolean).join('\n\n'):[ad.title,ad.description,ad.keywords.length?'Palavras-chave: '+ad.keywords.join(', '):''].filter(Boolean).join('\n\n');
  try{if(!navigator.clipboard?.writeText)throw new Error('A cópia automática não está disponível neste navegador.');await navigator.clipboard.writeText(content);setMessage(channel==='instagram'?'Legenda do Instagram copiada. Anexe a imagem e revise antes de publicar.':'Texto para Facebook copiado. Anexe a imagem e revise antes de publicar.');}
  catch(e){setMessage(e instanceof Error?e.message:'Não foi possível copiar o anúncio.');}
 }
 async function saveSettings(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setSaving(true);
  try{
   const payload={company_id:companyId,...settings,service_regions:regions.split(',').map(v=>v.trim()).filter(Boolean),updated_by:userId};
   const {error}=await supabase.from('marketing_settings').upsert(payload,{onConflict:'company_id'});if(error)throw error;
   await load();setMessage('Configurações salvas e prontas para os próximos anúncios.');
  }catch(e){setMessage(e instanceof Error?e.message:'Falha ao salvar configurações.');}
  finally{setSaving(false);}
 }
 async function saveAd(e:FormEvent<HTMLFormElement>|{preventDefault:()=>void},send:boolean){
  e.preventDefault();
  if(title.trim().length<5||description.trim().length<10){setMessage('Preencha um título e uma descrição completos.');return;}
  if(!platforms.length){setMessage('Selecione pelo menos um canal.');return;}
  if(imageFile&&(imageFile.size>MAX_IMAGE_BYTES||!['image/png','image/jpeg','image/webp'].includes(imageFile.type))){setMessage('Use uma imagem PNG, JPG ou WebP de até 5 MB.');return;}
  setSaving(true);
  let uploadedPath:string|null=null;
  try{
   let finalImageUrl=imageUrl.trim()||null;
   if(imageFile){
    const extension=imageFile.type==='image/png'?'png':imageFile.type==='image/webp'?'webp':'jpg';
    uploadedPath=`${companyId}/marketing/${crypto.randomUUID()}.${extension}`;
    const {error:uploadError}=await supabase.storage.from(BRANDING_BUCKET).upload(uploadedPath,imageFile,{cacheControl:'3600',contentType:imageFile.type,upsert:false});
    if(uploadError)throw uploadError;
    finalImageUrl=supabase.storage.from(BRANDING_BUCKET).getPublicUrl(uploadedPath).data.publicUrl;
   }else if(selectedProductImagePath){finalImageUrl=PRODUCT_IMAGE_PREFIX+selectedProductImagePath;}
   const payload={company_id:companyId,product_id:productId||null,title:title.trim(),description:description.trim(),keywords:keywords.split(',').map(v=>v.trim()).filter(Boolean),image_url:finalImageUrl,image_prompt:imagePrompt.trim(),platforms,status:send?'pending_approval':'draft',created_by:userId};
   const result=editing?await supabase.from('marketing_ads').update({product_id:payload.product_id,title:payload.title,description:payload.description,keywords:payload.keywords,image_url:payload.image_url,image_prompt:payload.image_prompt,platforms:payload.platforms,status:payload.status,approved_by:null,approved_at:null,approval_note:null,published_at:null}).eq('id',editing.id).eq('company_id',companyId):await supabase.from('marketing_ads').insert(payload);
   if(result.error)throw result.error;
   if(editing){const oldPath=managedBrandingPath(editing.image_url,companyId);if(oldPath&&oldPath!==uploadedPath)await supabase.storage.from(BRANDING_BUCKET).remove([oldPath]);}
   clearForm();await load();setMessage(send?'Anúncio enviado para revisão.':'Rascunho salvo.');
  }catch(e){
   if(uploadedPath)await supabase.storage.from(BRANDING_BUCKET).remove([uploadedPath]).catch(()=>undefined);
   setMessage(e instanceof Error?e.message:'Falha ao salvar anúncio.');
  }finally{setSaving(false);}
 }
 async function status(ad:Ad,next:'pending_approval'|'approved'|'rejected'){
  let note:string|null=null;
  if(next==='rejected'){note=window.prompt('Descreva o ajuste necessário para o anúncio:','Revise o conteúdo antes de enviar novamente.');if(note===null)return;if(!note.trim()){setMessage('Informe o ajuste necessário.');return;}}
  const patch={status:next,approval_note:note,approved_by:next==='approved'?userId:null,approved_at:next==='approved'?new Date().toISOString():null,published_at:null};
  const {error}=await supabase.from('marketing_ads').update(patch).eq('id',ad.id).eq('company_id',companyId);
  if(error)setMessage(error.message);else{await load();setMessage(next==='approved'?'Anúncio aprovado. Nenhuma publicação foi realizada.':'Status atualizado.');}
 }
 async function remove(ad:Ad){
  if(!window.confirm('Excluir este anúncio?'))return;
  const {error}=await supabase.from('marketing_ads').delete().eq('id',ad.id).eq('company_id',companyId);
  if(error){setMessage(error.message);return;}
  const path=managedBrandingPath(ad.image_url,companyId);if(path)await supabase.storage.from(BRANDING_BUCKET).remove([path]);
  await load();setMessage('Anúncio excluído.');
 }
 const visible=useMemo(()=>ads.filter(a=>filter==='all'||a.status===filter),[ads,filter]);
 const selected=products.find(p=>p.id===productId);
 const selectedImage=productImages.find(image=>image.storage_path===selectedProductImagePath);
 const previewSrc=imagePreview||selectedImage?.signed_url||(imageUrl&&!imageUrl.startsWith(PRODUCT_IMAGE_PREFIX)?imageUrl:'');
 const previewDescription=description.trim()||'A descrição do anúncio aparecerá aqui enquanto você edita o conteúdo.';
 const previewTitle=title.trim()||'Título do seu anúncio';
 const previewBrand=settings.business_name.trim()||'Nome da sua empresa';
 const previewChannelInfo=channels.find(c=>c.id===previewChannel)?.label??'Instagram';
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
   <div className="marketing-toolbar"><select aria-label="Filtrar anúncios" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todos os anúncios</option>{Object.entries(labels).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select><button type="button" className="secondary-button" onClick={()=>void load()}>Atualizar</button></div>
   {loading?<p className="module-empty">Carregando anúncios...</p>:visible.length===0?<p className="module-empty">Nenhum anúncio nesta lista. Crie o primeiro usando um brinquedo do estoque.</p>:<div className="marketing-ad-list">{visible.map(ad=><article className="marketing-ad-card" key={ad.id}>
    {ad.image_display_url?<img src={ad.image_display_url} alt="Imagem do anúncio"/>:<div className="marketing-image-placeholder">Imagem ainda não adicionada</div>}
    <div className="marketing-ad-content"><div className="marketing-ad-top"><span className={'marketing-status status-'+ad.status}>{labels[ad.status]??ad.status}</span><small>{new Date(ad.created_at).toLocaleDateString('pt-BR')}</small></div><h3>{ad.title}</h3><p>{ad.description}</p>{ad.approval_note&&<p className="marketing-approval-note"><strong>Orientação da revisão:</strong> {ad.approval_note}</p>}<div className="marketing-tags">{ad.platforms.map(v=><span key={v}>{channels.find(c=>c.id===v)?.label??v}</span>)}</div><small>Palavras-chave: {ad.keywords.join(', ')||'Não informadas'}</small>
    <div className="marketing-actions">{ad.status==='approved'?<>{ad.platforms.includes('instagram')?<button type="button" className="secondary-button" onClick={()=>void copyAd(ad,'instagram')}>Copiar para Instagram</button>:null}{ad.platforms.some(v=>v.startsWith('facebook'))?<button type="button" className="secondary-button" onClick={()=>void copyAd(ad,'facebook')}>Copiar para Facebook</button>:null}</>:<span className="marketing-not-published">Cópia liberada somente após aprovação</span>}{ad.image_display_url?<a className="marketing-image-open" href={ad.image_display_url} target="_blank" rel="noreferrer">Abrir imagem</a>:null}<button type="button" className="secondary-button" onClick={()=>edit(ad)}>Editar</button>{ad.status==='draft'||ad.status==='rejected'?<button type="button" onClick={()=>void status(ad,'pending_approval')}>Enviar para revisão</button>:null}{ad.status==='pending_approval'?<><button type="button" onClick={()=>void status(ad,'approved')}>Aprovar</button><button type="button" className="secondary-button" onClick={()=>void status(ad,'rejected')}>Solicitar ajustes</button></>:null}{ad.status==='approved'?<span className="marketing-not-published">Aprovado · publicação não conectada</span>:null}<button type="button" className="danger-button" onClick={()=>void remove(ad)}>Excluir</button></div>
    </div></article>)}</div>}
   <div className="marketing-editor-layout">
    <form className="customer-form marketing-editor" onSubmit={e=>void saveAd(e,false)}>
     <h3>{editing?'Editar anúncio':'Preparar anúncio'}</h3><p className="module-description">Selecione um brinquedo para preencher uma primeira versão. Você pode revisar todos os campos e a prévia antes de salvar.</p>
     <label>Brinquedo do estoque<select value={productId} onChange={e=>generate(e.target.value)}><option value="">Selecione um brinquedo</option>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
     {selected&&<p className="marketing-product-hint">Preço cadastrado: R$ {Number(selected.daily_price).toFixed(2)} por diária. O preço não será publicado automaticamente.</p>}
     <label>Título *<input required minLength={5} maxLength={180} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Título do anúncio"/></label>
     <label>Descrição *<textarea required minLength={10} maxLength={5000} rows={6} value={description} onChange={e=>setDescription(e.target.value)}/></label>
     <label>Palavras-chave (separadas por vírgula)<input value={keywords} onChange={e=>setKeywords(e.target.value)}/></label>
     <label>Foto cadastrada no estoque<select value={selectedProductImagePath} onChange={e=>{setSelectedProductImagePath(e.target.value);setImageFile(null);setImageUrl('');}}><option value="">Não usar foto do estoque</option>{productImages.map(image=><option key={image.id} value={image.storage_path}>{image.product_name}{image.caption?' · '+image.caption:''}{image.is_cover?' · Capa':''}</option>)}</select><small>As fotos existentes são exibidas com acesso temporário seguro e não são duplicadas.</small></label>
     <label>Enviar nova imagem (PNG, JPG ou WebP · até 5 MB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0]??null;setImageFile(file);setSelectedProductImagePath('');setImageUrl('');}}/></label>
     <label>Ou link da imagem (opcional)<input type="url" value={imageUrl} onChange={e=>{setImageUrl(e.target.value);setImageFile(null);setSelectedProductImagePath('');}} placeholder="https://..."/></label>
     <label>Orientação para produzir a imagem<textarea rows={3} value={imagePrompt} onChange={e=>setImagePrompt(e.target.value)} placeholder="Descreva a imagem que deverá acompanhar o anúncio."/></label>
     <fieldset className="marketing-channel-field"><legend>Canais desejados</legend>{channels.map(c=><label className="marketing-check" key={c.id}><input type="checkbox" checked={platforms.includes(c.id)} onChange={e=>setPlatforms(e.target.checked?[...platforms,c.id]:platforms.filter(v=>v!==c.id))}/>{c.label}</label>)}</fieldset>
     <div className="form-actions"><button type="button" className="secondary-button" onClick={clearForm}>Limpar</button><button type="submit" disabled={saving}>{saving?'Salvando...':'Salvar rascunho'}</button><button type="button" disabled={saving} onClick={()=>void saveAd({preventDefault:()=>{}},true)}>{saving?'Aguarde...':'Enviar para aprovação'}</button></div>
    </form>
    <aside className="marketing-preview-panel">
     <div className="marketing-preview-heading"><div><p className="eyebrow">PRÉVIA DO CRIATIVO</p><h3>Visualização do anúncio</h3></div><span>Não publicado</span></div>
     <div className="marketing-preview-switch">{['instagram','facebook_marketplace'].map(channel=><button type="button" key={channel} className={previewChannel===channel?'active':''} aria-pressed={previewChannel===channel} onClick={()=>setPreviewChannel(channel)}>{channel==='instagram'?'Instagram':'Facebook'}</button>)}</div>
     <article className={'marketing-preview-card '+(previewChannel==='instagram'?'preview-instagram':'preview-facebook')}>
      <header><span className="marketing-preview-avatar">✦</span><div><strong>{previewBrand}</strong><small>{previewChannelInfo} · Prévia</small></div></header>
      {previewSrc?<img className="marketing-preview-image" src={previewSrc} alt="Prévia da imagem do anúncio"/>:<div className="marketing-preview-image marketing-preview-empty">Sua imagem aparecerá aqui</div>}
      <div className="marketing-preview-copy"><strong>{previewTitle}</strong><p>{previewDescription}</p><span>{settings.default_call_to_action}{settings.whatsapp?' · '+settings.whatsapp:''}</span></div>
     </article>
     <p className="marketing-preview-footnote">A prévia é ilustrativa. A aparência final pode variar conforme o formato e as regras de cada plataforma.</p>
    </aside>
   </div>
  </>}
 </section>;
}
