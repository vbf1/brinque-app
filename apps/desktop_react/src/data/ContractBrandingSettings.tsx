import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type Settings = {
  landlordName:string; landlordCpf:string; landlordPhone:string; commercialName:string;
  landlordAddress:string; landlordZip:string; landlordNeighborhood:string; landlordCityState:string;
  primaryColor:string; accentColor:string;
};
const defaults:Settings = {
  landlordName:'',landlordCpf:'',landlordPhone:'',commercialName:'',landlordAddress:'',landlordZip:'',
  landlordNeighborhood:'',landlordCityState:'',primaryColor:'#174b78',accentColor:'#f4cf2e'
};
export function ContractBrandingSettings({companyId,companyName}:{companyId:string;companyName:string}) {
  const [settings,setSettings]=useState<Settings>(defaults);
  const [authorized,setAuthorized]=useState(false);
  const [logoUrl,setLogoUrl]=useState('');
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    void Promise.all([
      supabase.rpc('has_company_role',{p_company_id:companyId,p_roles:['owner','admin']}),
      supabase.from('companies').select('contract_logo_url,contract_settings').eq('id',companyId).single()
    ]).then(([permission,{data,error}])=>{
      if(!active)return;
      if(error){setError(error.message);return;}
      setAuthorized(permission.data===true);
      setLogoUrl(data.contract_logo_url??'');
      setSettings({...defaults,...(data.contract_settings??{}),commercialName:(data.contract_settings??{}).commercialName||companyName});
    });
    return ()=>{active=false;};
  },[companyId,companyName]);
  function set<K extends keyof Settings>(key:K,value:Settings[K]){setSettings(current=>({...current,[key]:value}));}
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setSaving(true);setError('');setMessage('');
    try{
      const {error}=await supabase.from('companies').update({contract_settings:settings,updated_at:new Date().toISOString()}).eq('id',companyId);
      if(error)throw error;
      setMessage('Identidade visual e dados do locador salvos para esta empresa.');
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.');}
    finally{setSaving(false);}
  }
  async function uploadLogo(file?:File){
    if(!file)return;
    if(!['image/png','image/jpeg'].includes(file.type)||file.size>5*1024*1024){setError('Use PNG ou JPG de até 5 MB.');return;}
    setUploading(true);setError('');setMessage('');
    try{
      const ext=file.name.split('.').pop()?.toLowerCase()||'png';
      const path=companyId+'/contract-logo-'+Date.now()+'.'+ext;
      const {error:uploadError}=await supabase.storage.from('company-branding').upload(path,file,{contentType:file.type});
      if(uploadError)throw uploadError;
      const {data}=supabase.storage.from('company-branding').getPublicUrl(path);
      const {error:updateError}=await supabase.from('companies').update({contract_logo_url:data.publicUrl,updated_at:new Date().toISOString()}).eq('id',companyId);
      if(updateError)throw updateError;
      setLogoUrl(data.publicUrl+'?v='+Date.now());
      setMessage('Logo atualizada. Salve os demais dados se também os alterou.');
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível enviar a logo.');}
    finally{setUploading(false);}
  }
  if(!authorized)return null;
  return <details className="marketing-editor">
    <summary><strong>Identidade visual e dados do locador</strong><span className="module-description">Personalize o contrato desta empresa sem alterar os dados das outras.</span></summary>
    <form className="customer-form" onSubmit={save}>
      <h4>Logo do contrato</h4>
      {logoUrl&&<img src={logoUrl} alt="Logo da empresa" style={{maxWidth:160,maxHeight:90,objectFit:'contain'}}/>}
      <label>Enviar logo (PNG ou JPG)<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={uploading} onChange={e=>void uploadLogo(e.target.files?.[0])}/></label>
      <div className="form-grid">
        <label>Cor principal<input type="color" value={settings.primaryColor} onChange={e=>set('primaryColor',e.target.value)}/></label>
        <label>Cor de destaque<input type="color" value={settings.accentColor} onChange={e=>set('accentColor',e.target.value)}/></label>
      </div>
      <h4>Dados do LOCADOR – PESSOA FÍSICA</h4>
      <div className="form-grid">
        <label>Nome completo<input value={settings.landlordName} onChange={e=>set('landlordName',e.target.value)} required/></label>
        <label>CPF<input value={settings.landlordCpf} onChange={e=>set('landlordCpf',e.target.value)}/></label>
        <label>Telefone/WhatsApp<input value={settings.landlordPhone} onChange={e=>set('landlordPhone',e.target.value)}/></label>
        <label>Nome comercial<input value={settings.commercialName} onChange={e=>set('commercialName',e.target.value||companyName)}/></label>
        <label>Endereço<input value={settings.landlordAddress} onChange={e=>set('landlordAddress',e.target.value)}/></label>
        <label>CEP<input value={settings.landlordZip} onChange={e=>set('landlordZip',e.target.value)}/></label>
        <label>Bairro<input value={settings.landlordNeighborhood} onChange={e=>set('landlordNeighborhood',e.target.value)}/></label>
        <label>Cidade/UF<input value={settings.landlordCityState} onChange={e=>set('landlordCityState',e.target.value)}/></label>
      </div>
      <button type="submit" disabled={saving||uploading}>{saving?'Salvando...':'Salvar identidade do contrato'}</button>
      {error&&<p role="alert" style={{color:'var(--red)'}}>{error}</p>}
      {message&&<p role="status">{message}</p>}
    </form>
  </details>;
}
