import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
const HORDE_API = 'https://aihorde.net/api/v2';
type StudioImage = { url: string; seed?: number };

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
 const [searchTerm,setSearchTerm]=useState('');
 const [channelFilter,setChannelFilter]=useState('all');
 const [imageLoadError,setImageLoadError]=useState(false);
 const [facebookAssistAdId,setFacebookAssistAdId]=useState<string|null>(null);
 const [previewChannel,setPreviewChannel]=useState('instagram');
 const [studioOpen,setStudioOpen]=useState(false);
 const [studioSourceFile,setStudioSourceFile]=useState<File|null>(null);
 const [studioSourcePath,setStudioSourcePath]=useState('');
 const [studioCount,setStudioCount]=useState(4);
 const [studioScene,setStudioScene]=useState('festa');
 const [studioConsent,setStudioConsent]=useState(false);
 const [studioBusy,setStudioBusy]=useState(false);
 const [studioProgress,setStudioProgress]=useState('');
 const [studioImages,setStudioImages]=useState<StudioImage[]>([]);
 const studioInputRef=useRef<HTMLInputElement>(null);
 const imageInputRef=useRef<HTMLInputElement>(null);

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
  setEditing(null);setProductId('');setTitle('');setDescription('');setKeywords('');setImageUrl('');setImageLoadError(false);setImagePrompt('');setImageFile(null);setSelectedProductImagePath('');if(imageInputRef.current)imageInputRef.current.value='';setPlatforms(['facebook_marketplace']);
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
  setEditing(ad);setProductId(ad.product_id??'');setTitle(ad.title);setDescription(ad.description);setKeywords(ad.keywords.join(', '));setImagePrompt(ad.image_prompt??'');setPlatforms(ad.platforms??['facebook_marketplace']);setTab('ads');setImageLoadError(false);setImageFile(null);if(imageInputRef.current)imageInputRef.current.value='';
  if(ad.image_url?.startsWith(PRODUCT_IMAGE_PREFIX)){setSelectedProductImagePath(ad.image_url.slice(PRODUCT_IMAGE_PREFIX.length));setImageUrl('');}
  else{setSelectedProductImagePath('');setImageUrl(ad.image_url??'');}
 }
 async function copyText(text:string,label:string){
  try{
   if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);}
   else{
    const fallback=document.createElement('textarea');fallback.value=text;fallback.setAttribute('readonly','');fallback.style.position='fixed';fallback.style.opacity='0';document.body.appendChild(fallback);fallback.select();const copied=document.execCommand('copy');document.body.removeChild(fallback);
    if(!copied)throw new Error('Este navegador não permitiu copiar. Selecione e copie manualmente.');
   }
   setMessage(label+' copiado. Cole no campo correspondente do Facebook.');
  }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível copiar o conteúdo.');}
 }
 function openFacebook(){
  window.open('https://www.facebook.com/','_blank','noopener,noreferrer');
 }
 async function copyAd(ad:Ad,channel:'instagram'|'facebook'){
  const tags=ad.keywords.map(value=>'#'+value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/[^a-zA-Z0-9]+/g,'')).filter(tag=>tag.length>1).slice(0,12).join(' ');
  const contact=[settings.default_call_to_action.trim()?'Chamada para ação: '+settings.default_call_to_action.trim():'',settings.whatsapp.trim()?'WhatsApp: '+settings.whatsapp.trim():''].filter(Boolean);
  const content=(channel==='instagram'?[ad.title,ad.description,tags,...contact]:[ad.title,ad.description,ad.keywords.length?'Palavras-chave: '+ad.keywords.join(', '):'',...contact]).filter(Boolean).join('\n\n');
  try{
   if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(content);}
   else{const fallback=document.createElement('textarea');fallback.value=content;fallback.setAttribute('readonly','');fallback.style.position='fixed';fallback.style.opacity='0';document.body.appendChild(fallback);fallback.select();const copied=document.execCommand('copy');document.body.removeChild(fallback);if(!copied)throw new Error('Este navegador não permitiu copiar. Selecione e copie o texto manualmente.');}
   setMessage(channel==='instagram'?'Legenda do Instagram copiada. Anexe a imagem e revise antes de publicar.':'Texto para Facebook copiado. Anexe a imagem e revise antes de publicar.');
  }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível copiar o anúncio. Selecione o texto e copie manualmente.');}
 }
 
 function duplicateAd(ad:Ad){
  setEditing(null);setProductId(ad.product_id??'');setTitle((ad.title+' (cópia)').slice(0,180));setDescription(ad.description);setKeywords(ad.keywords.join(', '));setImagePrompt(ad.image_prompt??'');setPlatforms(ad.platforms??['facebook_marketplace']);setImageFile(null);setImageLoadError(false);
  if(ad.image_url?.startsWith(PRODUCT_IMAGE_PREFIX)){setSelectedProductImagePath(ad.image_url.slice(PRODUCT_IMAGE_PREFIX.length));setImageUrl('');}
  else{setSelectedProductImagePath('');setImageUrl(ad.image_url??'');}
  if(imageInputRef.current)imageInputRef.current.value='';setTab('ads');setMessage('Cópia preparada como novo rascunho. Revise o conteúdo antes de salvar.');
 }
 function exportAd(ad:Ad){
  const channelNames=ad.platforms.map(v=>channels.find(ch=>ch.id===v)?.label??v);
  const content=['MATERIAL DE DIVULGAÇÃO','=====================','','TÍTULO',ad.title,'','DESCRIÇÃO',ad.description,'','PALAVRAS-CHAVE',ad.keywords.join(', ')||'Não informadas','','CANAIS SELECIONADOS',channelNames.join(', ')||'Não informados','','LINK DA IMAGEM',ad.image_url||'Não informado','','ORIENTAÇÃO PARA A IMAGEM',ad.image_prompt||'Não informada','','CHAMADA PARA AÇÃO',settings.default_call_to_action.trim()||'Não configurada','WHATSAPP',settings.whatsapp.trim()||'Não configurado','','STATUS NO KIDSLOC',labels[ad.status]??ad.status,'','Observação: a publicação deve ser feita manualmente na plataforma escolhida.'].join(String.fromCharCode(10));
  const safeName=ad.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'anuncio';
  const file=new Blob([String.fromCharCode(65279),content],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(file);const link=document.createElement('a');link.href=url;link.download=safeName+'.txt';document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);setMessage('Material do anúncio preparado para download.');
 }
 function exportVisibleAds(){
  if(!visible.length){setMessage('Não há anúncios para exportar com os filtros atuais.');return;}
  const content=visible.map((ad,index)=>['ANÚNCIO '+(index+1),ad.title,ad.description,'Palavras-chave: '+(ad.keywords.join(', ')||'Não informadas'),'Canais: '+ad.platforms.map(v=>channels.find(ch=>ch.id===v)?.label??v).join(', '),'Imagem: '+(ad.image_url||'Não informada'),'Orientação da imagem: '+(ad.image_prompt||'Não informada'),'Chamada para ação: '+(settings.default_call_to_action.trim()||'Não configurada'),'WhatsApp: '+(settings.whatsapp.trim()||'Não configurado'),'Status: '+(labels[ad.status]??ad.status)].join(String.fromCharCode(10))).join(String.fromCharCode(10,10,10));
  const file=new Blob([String.fromCharCode(65279),content],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(file);const link=document.createElement('a');link.href=url;link.download='kidsloc-anuncios-filtrados.txt';document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);setMessage('Lista filtrada preparada para download.');
 }

 async function generateStudioImages(){
  if(!studioConsent){setMessage('Confirme o aviso de privacidade antes de enviar a foto.');return;}
  if(!studioSourceFile&&!studioSourcePath){setMessage('Envie uma foto ou escolha uma imagem cadastrada no estoque.');return;}
  setStudioBusy(true);setStudioImages([]);setStudioProgress('Preparando a foto...');setMessage('');
  try{
   let sourceFile=studioSourceFile;
   if(!sourceFile&&studioSourcePath){
    const source=productImages.find(item=>item.storage_path===studioSourcePath);
    if(!source?.signed_url)throw new Error('Não foi possível acessar a foto escolhida no estoque.');
    const response=await fetch(source.signed_url);if(!response.ok)throw new Error('Falha ao baixar a foto do estoque.');
    const blob=await response.blob();sourceFile=new File([blob], 'brinquedo-origem.'+(blob.type.includes('png')?'png':'jpg'),{type:blob.type||'image/jpeg'});
   }
   if(!sourceFile)throw new Error('Selecione uma foto de origem.');
   if(sourceFile.size>MAX_IMAGE_BYTES||!['image/png','image/jpeg','image/webp'].includes(sourceFile.type))throw new Error('Use uma foto PNG, JPG ou WebP de até 5 MB.');
   const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(new Error('Não foi possível ler a foto.'));reader.onerror=()=>reject(new Error('Não foi possível ler a foto.'));reader.readAsDataURL(sourceFile!);});
   const sourceImage=dataUrl.split(',')[1];
   const scenes:Record<string,string[]> = {
    festa:[
     'em um salão de festa infantil com balões em tons pastel ao fundo, decoração discreta e luz natural',
     'em uma festa infantil ao ar livre, com mesas decoradas e bandeirolas desfocadas ao fundo',
     'em um espaço de recreação infantil colorido, com decoração alegre e organizada ao fundo',
     'em um salão de eventos elegante, com painel decorativo suave e iluminação acolhedora'
    ],
    externo:[
     'em um gramado amplo e bem cuidado, com árvores ao fundo e luz suave da manhã',
     'em um quintal espaçoso de casa, com jardim e cerca viva ao fundo',
     'em uma área externa de espaço para eventos, com piso limpo e paisagismo discreto',
     'em um parque arborizado, com fundo verde desfocado e luz natural de fim de tarde'
    ],
    estudio:[
     'em estúdio fotográfico com fundo branco infinito e iluminação lateral suave',
     'em estúdio fotográfico com fundo bege claro, sombras naturais e composição de catálogo',
     'em estúdio fotográfico com fundo cinza muito claro e iluminação profissional uniforme',
     'em estúdio fotográfico com fundo creme, luz suave de janela e sombra realista no chão'
    ],
    neutro:[
     'em cenário minimalista com fundo branco fosco e piso branco, estilo catálogo de produtos',
     'em cenário minimalista com fundo areia claro e iluminação natural suave',
     'em cenário clean com fundo cinza pérola e sombra discreta no piso',
     'em cenário minimalista com fundo off-white e luz difusa, fotografia comercial'
    ]
   };
   const variants=scenes[studioScene]??scenes.festa;
   const jobs=await Promise.all(Array.from({length:studioCount},async(_,index)=>{
    const prompt='Crie uma fotografia publicitária REALISTA usando a foto enviada como referência obrigatória. O objeto principal deve continuar sendo EXATAMENTE o mesmo brinquedo físico da foto: preserve modelo, estrutura, formato, cores, proporções, quantidade e posição das peças, acessórios, costuras, entradas, escorregadores, redes e todos os detalhes visíveis. NÃO redesenhe, NÃO estilize, NÃO acrescente nem remova partes. Não espelhe o produto. Mantenha o brinquedo inteiro visível, no mesmo ângulo geral da foto de referência, com perspectiva e proporções naturais. Produza uma fotografia diferente das outras variações, mudando somente o cenário e a composição ao redor. Variação '+(index+1)+': '+variants[index%variants.length]+'. Enquadramento comercial '+(index%2===0?'horizontal mais aberto, com espaço ao redor do brinquedo':'vertical mais aproximado, mantendo o brinquedo inteiro no quadro'))+'. Sem pessoas, sem texto, sem logotipos e sem marcas d’água.';
    const randomSeed=crypto.getRandomValues(new Uint32Array(1))[0];
    const submitted=await fetch(HORDE_API+'/generate/async',{method:'POST',headers:{'Content-Type':'application/json','apikey':'0000000000','Client-Agent':'KidsLocApp:1.0'},body:JSON.stringify({prompt,params:{n:1,width:512,height:512,steps:25,cfg_scale:8,denoising_strength:0.45,seed:String(randomSeed)},nsfw:false,censor_nsfw:true,r2:true,shared:false,source_image:sourceImage,source_processing:'img2img'})});
    const data=await submitted.json();if(!submitted.ok||!data.id)throw new Error(data.message||data.errors?.[0]?.message||'O serviço gratuito não aceitou uma das solicitações.');
    return {id:data.id,index,done:false};
   }));
   setStudioProgress('Foram enviadas '+jobs.length+' solicitações independentes, cada uma com cenário, instrução e semente diferentes. Aguardando a fila gratuita...');
   const results:StudioImage[]=[];
   for(let attempt=0;attempt<120&&jobs.some(job=>!job.done);attempt++){
    await new Promise(resolve=>window.setTimeout(resolve,5000));
    await Promise.all(jobs.filter(job=>!job.done).map(async job=>{
     const checkResponse=await fetch(HORDE_API+'/generate/check/'+job.id,{headers:{'apikey':'0000000000','Client-Agent':'KidsLocApp:1.0'}});
     if(!checkResponse.ok)throw new Error('Não foi possível consultar uma das solicitações de geração.');
     const check=await checkResponse.json();
     if(check.done||Number(check.finished)>=1){
      job.done=true;
      const response=await fetch(HORDE_API+'/generate/status/'+job.id,{headers:{'apikey':'0000000000','Client-Agent':'KidsLocApp:1.0'}});
      if(!response.ok)throw new Error('Uma imagem foi processada, mas não foi possível recuperar o resultado.');
      const result=await response.json();
      const generation=(result.generations??[]).find((item:any)=>typeof item.img==='string'&&item.img.startsWith('https://'));
      if(generation)results.push({url:generation.img,seed:generation.seed});
     }
    }));
    setStudioProgress('Imagens concluídas: '+results.length+'/'+studioCount+' · solicitações independentes em processamento: '+jobs.filter(job=>!job.done).length+'.');
    if(results.length===studioCount)break;
   }
   setStudioImages(results);
   if(!results.length)throw new Error('A fila terminou sem retornar imagens. Tente novamente mais tarde.');
   setStudioProgress(results.length+' de '+studioCount+' imagens recebidas. Cada variação foi solicitada separadamente; confira se o brinquedo continua fiel à foto original.');
   if(results.length<studioCount)setMessage('O serviço gratuito retornou apenas '+results.length+' de '+studioCount+' imagens dentro do tempo limite. Você pode baixar as que chegaram.');
  }catch(error){setMessage(error instanceof Error?error.message:'Não foi possível gerar as imagens.');setStudioProgress('');}
  finally{setStudioBusy(false);}
 }

 async function downloadStudioImage(item:StudioImage,index:number){
  try{
   const response=await fetch(item.url);
   if(!response.ok)throw new Error('O servidor não disponibilizou o arquivo para download.');
   const blob=await response.blob();
   const objectUrl=URL.createObjectURL(blob);
   const link=document.createElement('a');
   link.href=objectUrl;link.download='kidsloc-brinquedo-variacao-'+(index+1)+'.'+(blob.type.includes('png')?'png':'jpg');
   document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
   setMessage('Download da variação '+(index+1)+' iniciado.');
  }catch(error){
   setMessage(error instanceof Error?'Não foi possível baixar diretamente: '+error.message+' Use “Abrir imagem” e salve pelo navegador.':'Não foi possível baixar a imagem.');
  }
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
  const normalizedImageUrl=imageUrl.trim();
  if(normalizedImageUrl){try{const parsed=new URL(normalizedImageUrl);if(!['http:','https:'].includes(parsed.protocol))throw new Error();}catch{setMessage('Informe um link de imagem válido começando com http:// ou https://.');return;}}
  if(imageFile&&(imageFile.size>MAX_IMAGE_BYTES||!['image/png','image/jpeg','image/webp'].includes(imageFile.type))){setMessage('Use uma imagem PNG, JPG ou WebP de até 5 MB.');return;}
  setSaving(true);
  let uploadedPath:string|null=null;
  try{
   let finalImageUrl=normalizedImageUrl||null;
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
   if(editing&&editing.image_url!==finalImageUrl){const oldPath=managedBrandingPath(editing.image_url,companyId);if(oldPath&&oldPath!==uploadedPath)await supabase.storage.from(BRANDING_BUCKET).remove([oldPath]);}
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
 const visible=useMemo(()=>{const term=searchTerm.trim().toLocaleLowerCase('pt-BR');return ads.filter(a=>(filter==='all'||a.status===filter)&&(channelFilter==='all'||a.platforms.includes(channelFilter))&&(!term||[a.title,a.description,...a.keywords].some(value=>value.toLocaleLowerCase('pt-BR').includes(term))));},[ads,filter,channelFilter,searchTerm]);
 const selected=products.find(p=>p.id===productId);
 const selectedImage=productImages.find(image=>image.storage_path===selectedProductImagePath);
 const previewSrc=imagePreview||selectedImage?.signed_url||(imageUrl&&!imageUrl.startsWith(PRODUCT_IMAGE_PREFIX)?imageUrl:'');
 const previewDescription=description.trim()||'A descrição do anúncio aparecerá aqui enquanto você edita o conteúdo.';
 const previewTitle=title.trim()||'Título do seu anúncio';
 const previewBrand=settings.business_name.trim()||'Nome da sua empresa';
 const previewChannelInfo=channels.find(c=>c.id===previewChannel)?.label??'Instagram';
 return <section className="module-shell marketing-module">
  <header className="module-header"><div><p className="eyebrow">DIVULGAÇÃO DA EMPRESA</p><h2>Marketing e anúncios</h2><p className="module-description">Prepare anúncios, revise o conteúdo e aprove antes de qualquer publicação.</p><p className="marketing-manual-note">Prepare o anúncio uma vez e reutilize o conteúdo na divulgação. Para locação de brinquedos, prefira a Página ou grupos que permitam esse tipo de oferta: o Marketplace pode não aceitar anúncios de serviços.</p></div><button type="button" onClick={()=>{clearForm();setTab('ads');}}>＋ Novo anúncio</button></header>
  <div className="marketing-tabs"><button type="button" className={tab==='ads'?'active':''} onClick={()=>setTab('ads')}>Anúncios</button><button type="button" className={tab==='settings'?'active':''} onClick={()=>setTab('settings')}>Configurações fixas</button><button type="button" className={studioOpen?'active':''} onClick={()=>{setStudioOpen(value=>!value);setTab('ads');}}>Estúdio de imagens IA</button></div>
  {studioOpen&&<section className="marketing-ai-studio" aria-label="Estúdio de imagens com IA"><div className="marketing-ai-heading"><div><p className="eyebrow">FERRAMENTA GRATUITA</p><h3>Estúdio de imagens com IA</h3><p>Envie uma foto real do brinquedo e gere várias versões com novos cenários e composições.</p></div><span>4 imagens por padrão</span></div><div className="marketing-ai-controls"><label>Foto cadastrada no estoque<select value={studioSourcePath} onChange={e=>{setStudioSourcePath(e.target.value);setStudioSourceFile(null);setStudioImages([]);}}><option value="">Escolher foto do estoque...</option>{productImages.map(item=><option key={item.id} value={item.storage_path}>{item.product_name}{item.caption?' · '+item.caption:''}</option>)}</select></label><label>Ou enviar uma foto<input ref={studioInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{setStudioSourceFile(e.target.files?.[0]??null);setStudioSourcePath('');setStudioImages([]);}}/><small>PNG, JPG ou WebP · até 5 MB</small></label><label>Quantidade de imagens<select value={studioCount} onChange={e=>setStudioCount(Number(e.target.value))}><option value={4}>4 imagens</option><option value={6}>6 imagens</option><option value={8}>8 imagens</option></select></label><label>Cenário das variações<select value={studioScene} onChange={e=>setStudioScene(e.target.value)}><option value="festa">Festa infantil</option><option value="externo">Área externa / jardim</option><option value="estudio">Estúdio profissional</option><option value="neutro">Fundo clean de catálogo</option></select></label></div><label className="marketing-ai-consent"><input type="checkbox" checked={studioConsent} onChange={e=>setStudioConsent(e.target.checked)}/> Entendi que a foto será enviada à rede AI Horde, processada por computadores de voluntários e que solicitações anônimas podem ser compartilhadas para aprimoramento de modelos.</label><button type="button" disabled={studioBusy||!studioConsent||(!studioSourceFile&&!studioSourcePath)} onClick={()=>void generateStudioImages()}>{studioBusy?'Gerando imagens...':'Gerar '+studioCount+' imagens gratuitamente'}</button>{studioProgress&&<p className="marketing-ai-progress" role="status">{studioProgress}</p>}{studioBusy&&<p className="marketing-ai-note">A fila é comunitária e pode demorar. Não feche esta tela enquanto a geração estiver em andamento.</p>}{studioImages.length>0&&<div className="marketing-ai-results"><h4>Resultados ({studioImages.length})</h4><div className="marketing-ai-grid">{studioImages.map((item,index)=><article key={item.url}><img src={item.url} alt={'Variação '+(index+1)+' do brinquedo'}/><div><span>Variação {index+1}</span><button type="button" className="secondary-button" onClick={()=>void downloadStudioImage(item,index)}>Baixar imagem</button><a href={item.url} target="_blank" rel="noreferrer">Abrir imagem</a><button type="button" className="secondary-button" onClick={()=>{setImageUrl(item.url);setImageFile(null);setSelectedProductImagePath('');setImageLoadError(false);setStudioOpen(false);setMessage('Imagem selecionada para o anúncio. Salve o rascunho para utilizá-la.');}}>Usar no anúncio</button></div></article>)}</div><p className="marketing-ai-note">Revise cada imagem: modelos de IA podem alterar detalhes do brinquedo. Use somente imagens que representem fielmente o item real.</p></div>}</section>}
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
   <div className="marketing-toolbar marketing-toolbar-filters"><input aria-label="Pesquisar anúncios" type="search" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Pesquisar por título, descrição ou palavra-chave..."/><select aria-label="Filtrar por status" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todos os status</option>{Object.entries(labels).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select><select aria-label="Filtrar por canal" value={channelFilter} onChange={e=>setChannelFilter(e.target.value)}><option value="all">Todos os canais</option>{channels.map(c=><option value={c.id} key={c.id}>{c.label}</option>)}</select><button type="button" className="secondary-button" onClick={()=>{setSearchTerm('');setFilter('all');setChannelFilter('all');}}>Limpar filtros</button><button type="button" className="secondary-button" onClick={exportVisibleAds}>Baixar lista filtrada</button><button type="button" className="secondary-button" onClick={()=>void load()}>Atualizar</button></div><p className="marketing-results-count">Exibindo {visible.length} de {ads.length} anúncios</p>
   {loading?<p className="module-empty">Carregando anúncios...</p>:visible.length===0?<p className="module-empty">{ads.length===0?'Nenhum anúncio cadastrado. Crie o primeiro usando um brinquedo do estoque.':'Nenhum anúncio corresponde aos filtros atuais. Tente outro termo ou limpe os filtros.'}</p>:<div className="marketing-ad-list">{visible.map(ad=><article className="marketing-ad-card" key={ad.id}>
    {ad.image_display_url?<img src={ad.image_display_url} alt="Imagem do anúncio"/>:<div className="marketing-image-placeholder">Imagem ainda não adicionada</div>}
    <div className="marketing-ad-content"><div className="marketing-ad-top"><span className={'marketing-status status-'+ad.status}>{labels[ad.status]??ad.status}</span><small>{new Date(ad.created_at).toLocaleDateString('pt-BR')}</small></div><h3>{ad.title}</h3><p>{ad.description}</p>{ad.approval_note&&<p className="marketing-approval-note"><strong>Orientação da revisão:</strong> {ad.approval_note}</p>}<div className="marketing-tags">{ad.platforms.map(v=><span key={v}>{channels.find(c=>c.id===v)?.label??v}</span>)}</div><small>Palavras-chave: {ad.keywords.join(', ')||'Não informadas'}</small>
    <div className="marketing-actions">{ad.status==='approved'?<>{ad.platforms.includes('instagram')?<button type="button" className="secondary-button" onClick={()=>void copyAd(ad,'instagram')}>Copiar para Instagram</button>:null}{ad.platforms.some(v=>v.startsWith('facebook'))?<button type="button" className="secondary-button" onClick={()=>setFacebookAssistAdId(facebookAssistAdId===ad.id?null:ad.id)}>{facebookAssistAdId===ad.id?'Fechar preparação':'Preparar divulgação no Facebook'}</button>:null}</>:<span className="marketing-not-published">Cópia liberada somente após aprovação</span>}<button type="button" className="secondary-button" onClick={()=>exportAd(ad)}>Baixar material</button><button type="button" className="secondary-button" onClick={()=>duplicateAd(ad)}>Duplicar</button>{ad.status==='approved'&&ad.image_display_url?<a className="marketing-image-open" href={ad.image_display_url} target="_blank" rel="noreferrer">Abrir imagem aprovada</a>:null}<button type="button" className="secondary-button" onClick={()=>edit(ad)}>Editar</button>{ad.status==='draft'||ad.status==='rejected'?<button type="button" onClick={()=>void status(ad,'pending_approval')}>Enviar para revisão</button>:null}{ad.status==='pending_approval'?<><button type="button" onClick={()=>void status(ad,'approved')}>Aprovar</button><button type="button" className="secondary-button" onClick={()=>void status(ad,'rejected')}>Solicitar ajustes</button></>:null}{ad.status==='approved'?<span className="marketing-not-published">Aprovado · publicação não conectada</span>:null}<button type="button" className="danger-button" onClick={()=>void remove(ad)}>Excluir</button></div>
    {facebookAssistAdId===ad.id&&ad.status==='approved'?<section className="marketing-facebook-assist" aria-label="Preparação de publicação no Facebook"><div><strong>Preparar divulgação no Facebook</strong><p>Copie cada parte e cole na publicação da sua Página ou em um grupo que permita esse tipo de divulgação.</p></div><div className="marketing-facebook-copy-actions"><button type="button" className="secondary-button" onClick={()=>void copyText(ad.title,'Título')}>Copiar título</button><button type="button" className="secondary-button" onClick={()=>void copyText(ad.description,'Descrição')}>Copiar descrição</button><button type="button" className="secondary-button" onClick={()=>void copyText([settings.default_call_to_action,settings.whatsapp?'WhatsApp: '+settings.whatsapp:''].filter(Boolean).join('\n'),'Contato e chamada')}>Copiar contato</button>{ad.image_display_url?<a className="marketing-image-open" href={ad.image_display_url} target="_blank" rel="noreferrer">Abrir foto para anexar</a>:<span className="marketing-not-published">Adicione uma foto antes de divulgar.</span>}</div><button type="button" onClick={openFacebook}>Abrir Facebook</button><small>Importante: aluguel é uma modalidade de serviço. O Marketplace é voltado à venda de itens físicos e pode rejeitar anúncios de locação. Esta preparação não publica nem abre um anúncio de venda no Marketplace.</small></section>:null}
    </div></article>)}</div>}
   <div className="marketing-editor-layout">
    <form className="customer-form marketing-editor" onSubmit={e=>void saveAd(e,false)}>
     <h3>{editing?'Editar anúncio':'Preparar anúncio'}</h3><p className="module-description">Selecione um brinquedo para preencher uma primeira versão. Você pode revisar todos os campos e a prévia antes de salvar.</p>
     <label>Brinquedo do estoque<select value={productId} onChange={e=>generate(e.target.value)}><option value="">Selecione um brinquedo</option>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
     {selected&&<p className="marketing-product-hint">Preço cadastrado: R$ {Number(selected.daily_price).toFixed(2)} por diária. O preço não será publicado automaticamente.</p>}
     <label>Título *<input required minLength={5} maxLength={180} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Título do anúncio"/></label>
     <label>Descrição *<textarea required minLength={10} maxLength={5000} rows={6} value={description} onChange={e=>setDescription(e.target.value)}/></label>
     <label>Palavras-chave (separadas por vírgula)<input value={keywords} onChange={e=>setKeywords(e.target.value)}/></label>
     <label>Foto cadastrada no estoque<select value={selectedProductImagePath} onChange={e=>{setSelectedProductImagePath(e.target.value);setImageLoadError(false);setImageFile(null);setImageUrl('');if(imageInputRef.current)imageInputRef.current.value='';}}><option value="">Não usar foto do estoque</option>{productImages.map(image=><option key={image.id} value={image.storage_path}>{image.product_name}{image.caption?' · '+image.caption:''}{image.is_cover?' · Capa':''}</option>)}</select><small>As fotos existentes são exibidas com acesso temporário seguro e não são duplicadas.</small></label>
     <label>Enviar nova imagem (PNG, JPG ou WebP · até 5 MB)<input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0]??null;setImageFile(file);setImageLoadError(false);setSelectedProductImagePath('');setImageUrl('');}}/></label>
     <label>Ou link da imagem (opcional)<input type="url" value={imageUrl} onChange={e=>{setImageUrl(e.target.value);setImageLoadError(false);setImageFile(null);setSelectedProductImagePath('');if(imageInputRef.current)imageInputRef.current.value='';}} placeholder="https://..."/></label>
     <label>Orientação para produzir a imagem<textarea rows={3} value={imagePrompt} onChange={e=>setImagePrompt(e.target.value)} placeholder="Descreva a imagem que deverá acompanhar o anúncio."/></label>
     <fieldset className="marketing-channel-field"><legend>Canais desejados</legend>{channels.map(c=><label className="marketing-check" key={c.id}><input type="checkbox" checked={platforms.includes(c.id)} onChange={e=>setPlatforms(e.target.checked?[...platforms,c.id]:platforms.filter(v=>v!==c.id))}/>{c.label}</label>)}</fieldset>{platforms.includes('facebook_marketplace')?<p className="marketing-marketplace-warning">Atenção: como este anúncio oferece locação, confirme as regras do Marketplace antes de tentar utilizá-lo. O KidsLoc não fará publicação automática nessa área.</p>:null}
     <div className="form-actions"><button type="button" className="secondary-button" onClick={clearForm}>Limpar</button><button type="submit" disabled={saving}>{saving?'Salvando...':'Salvar rascunho'}</button><button type="button" disabled={saving} onClick={()=>void saveAd({preventDefault:()=>{}},true)}>{saving?'Aguarde...':'Enviar para aprovação'}</button></div>
    </form>
    <aside className="marketing-preview-panel">
     <div className="marketing-preview-heading"><div><p className="eyebrow">PRÉVIA DO CRIATIVO</p><h3>Visualização do anúncio</h3></div><span>Não publicado</span></div>
     <div className="marketing-preview-switch">{['instagram','facebook_marketplace'].map(channel=><button type="button" key={channel} className={previewChannel===channel?'active':''} aria-pressed={previewChannel===channel} onClick={()=>setPreviewChannel(channel)}>{channel==='instagram'?'Instagram':'Facebook'}</button>)}</div>
     <article className={'marketing-preview-card '+(previewChannel==='instagram'?'preview-instagram':'preview-facebook')}>
      <header><span className="marketing-preview-avatar">✦</span><div><strong>{previewBrand}</strong><small>{previewChannelInfo} · Prévia</small></div></header>
      {previewSrc&&!imageLoadError?<img className="marketing-preview-image" src={previewSrc} alt="Prévia da imagem do anúncio" onError={()=>setImageLoadError(true)}/>:<div className="marketing-preview-image marketing-preview-empty">{imageLoadError?'Não foi possível carregar a imagem. Confira o link ou escolha outra foto.':'Sua imagem aparecerá aqui'}</div>}
      <div className="marketing-preview-copy"><strong>{previewTitle}</strong><p>{previewDescription}</p><span>{settings.default_call_to_action}{settings.whatsapp?' · '+settings.whatsapp:''}</span></div>
     </article>
     <p className="marketing-preview-footnote">A prévia é ilustrativa. A aparência final pode variar conforme o formato e as regras de cada plataforma.</p>
    </aside>
   </div>
  </>}
 </section>;
}
