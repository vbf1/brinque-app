import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class MarketingPage extends StatefulWidget {
  const MarketingPage({super.key, required this.companyId, required this.userId});
  final String companyId;
  final String userId;
  @override
  State<MarketingPage> createState() => _MarketingPageState();
}

class _MarketingPageState extends State<MarketingPage> {
  final _db = Supabase.instance.client;
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _keywords = TextEditingController();
  final _imageUrl = TextEditingController();
  final _imagePrompt = TextEditingController();
  final _business = TextEditingController();
  final _whatsapp = TextEditingController();
  final _regions = TextEditingController();
  final _defaultDescription = TextEditingController();
  final _cta = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _loading = true, _saving = false;
  String _tab = 'ads', _filter = 'all', _channel = 'all', _search = '', _message = '';
  String? _editingId, _productId, _productImage;
  XFile? _imageFile;
  final _picker = ImagePicker();
  bool _studioConsent = false, _studioBusy = false;
  String _studioScene = 'festa', _studioProgress = '';
  int _studioCount = 4;
  String? _studioSourcePath;
  XFile? _studioSourceFile;
  List<Map<String, dynamic>> _studioResults = [];
  static const _hordeApi = 'https://aihorde.net/api/v2';
  List<Map<String, dynamic>> _products = [], _images = [], _ads = [];
  List<String> _platforms = ['facebook_marketplace'];
  static const _channels = {
    'facebook_marketplace': 'Facebook Marketplace',
    'facebook_page': 'Página do Facebook',
    'facebook_groups': 'Grupos do Facebook',
    'instagram': 'Instagram',
  };
  static const _statuses = {
    'draft': 'Rascunho',
    'pending_approval': 'Aguardando aprovação',
    'approved': 'Aprovado',
    'published': 'Status marcado como publicado (sem integração)',
    'rejected': 'Precisa de ajustes',
  };

  @override
  void initState() { super.initState(); _load(); }

  @override
  void dispose() {
    for (final c in [_title,_description,_keywords,_imageUrl,_imagePrompt,_business,_whatsapp,_regions,_defaultDescription,_cta]) { c.dispose(); }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _message = ''; });
    try {
      final results = await Future.wait([
        _db.from('marketing_settings').select().eq('company_id', widget.companyId).maybeSingle(),
        _db.from('products').select('id,name,description,daily_price').eq('company_id', widget.companyId).eq('active', true).order('name'),
        _db.from('marketing_ads').select().eq('company_id', widget.companyId).order('created_at', ascending: false),
        _db.from('product_images').select('id,product_id,storage_path,caption,is_cover').eq('company_id', widget.companyId).order('is_cover', ascending: false),
      ]);
      final s = results[0] as Map<String, dynamic>?;
      final products = List<Map<String,dynamic>>.from(results[1] as List);
      final images = List<Map<String,dynamic>>.from(results[3] as List);
      final names = {for(final p in products) p['id'].toString():p['name'].toString()};
      for(final image in images) {
        image['product_name'] = names[image['product_id'].toString()] ?? 'Brinquedo';
        try { image['signed_url'] = await _db.storage.from('product-images').createSignedUrl(image['storage_path'],3600); } catch (_) {}
      }
      final ads = List<Map<String,dynamic>>.from(results[2] as List);
      for(final ad in ads) {
        final url = ad['image_url'] as String?;
        if(url != null && url.startsWith('product-image:')) {
          try { ad['image_display_url'] = await _db.storage.from('product-images').createSignedUrl(url.substring(14),3600); } catch (_) {}
        } else { ad['image_display_url'] = url; }
      }
      if(!mounted) return;
      setState(() {
        _business.text=s?['business_name']?.toString()??'';
        _whatsapp.text=s?['whatsapp']?.toString()??'';
        _regions.text=((s?['service_regions'] as List?)??const ['Contagem','Belo Horizonte']).join(', ');
        _defaultDescription.text=s?['default_description']?.toString()??'';
        _cta.text=s?['default_call_to_action']?.toString()??'Chame no WhatsApp para consultar disponibilidade';
        _products=products; _images=images; _ads=ads; _loading=false;
      });
    } catch(e) { if(mounted) setState(() { _loading=false; _message='Não foi possível carregar Marketing: $e'; }); }
  }

  void _clear() {
    _editingId=null; _productId=null; _productImage=null; _imageFile=null; _platforms=['facebook_marketplace'];
    _title.clear(); _description.clear(); _keywords.clear(); _imageUrl.clear(); _imagePrompt.clear();
  }

  void _generate(String? id) {
    final p=_products.where((v)=>v['id']==id).firstOrNull;
    if(p==null)return;
    final regions=_regions.text.split(',').map((v)=>v.trim()).where((v)=>v.isNotEmpty).toList();
    final area=regions.isEmpty?'Contagem e região':regions.join(', ');
    final business=_business.text.trim();
    setState(() {
      _productId=id;
      final title='Aluguel de '+p['name'].toString()+' em '+(regions.isEmpty?'Contagem':regions.first)+(business.isEmpty?'':' | '+business);
      _title.text=title.length>180?title.substring(0,180):title;
      _description.text=[
        _defaultDescription.text.trim(),
        if(business.isNotEmpty) business+' — locação de brinquedos para festas.',
        if((p['description'] as String?)?.trim().isNotEmpty==true) 'Detalhes do brinquedo: '+p['description'],
        'Leve mais diversão para sua festa com '+p['name'].toString()+'.',
        'Atendemos '+area+'.',
        _cta.text.trim()+' '+_whatsapp.text.trim(),
      ].where((v)=>v.trim().isNotEmpty).join('\n\n');
      _keywords.text=[p['name'].toString(),'aluguel de brinquedos','locação de brinquedos',...regions].join(', ');
      _imagePrompt.text='Fotografia publicitária realista de '+p['name'].toString()+' para locação em festa infantil. Sem textos, marcas ou marcas d’água.';
    });
  }

  void _edit(Map<String,dynamic> ad) {
    setState(() {
      _editingId=ad['id']; _productId=ad['product_id']; _title.text=ad['title']??'';
      _description.text=ad['description']??''; _keywords.text=((ad['keywords'] as List?)??[]).join(', ');
      _imagePrompt.text=ad['image_prompt']??''; _platforms=List<String>.from(ad['platforms']??[]); _imageFile=null;
      final url=ad['image_url'] as String?;
      if(url?.startsWith('product-image:')==true){_productImage=url!.substring(14);_imageUrl.clear();}
      else{_productImage=null;_imageUrl.text=url??'';}
      _tab='ads';
    });
    _editor();
  }

  Future<void> _pickImage() async {
    final picked = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 90);
    if (picked != null && mounted) setState(() { _imageFile = picked; _productImage = null; _imageUrl.clear(); });
  }

  Future<void> _settingsSave() async {
    setState(()=>_saving=true);
    try {
      await _db.from('marketing_settings').upsert({
        'company_id':widget.companyId,'business_name':_business.text.trim(),'whatsapp':_whatsapp.text.trim(),
        'service_regions':_regions.text.split(',').map((v)=>v.trim()).where((v)=>v.isNotEmpty).toList(),
        'default_description':_defaultDescription.text.trim(),'default_call_to_action':_cta.text.trim(),'updated_by':widget.userId,
      },onConflict:'company_id');
      await _load(); if(mounted)setState(()=>_message='Configurações salvas.');
    } catch(e){if(mounted)setState(()=>_message='Falha ao salvar: $e');}
    finally{if(mounted)setState(()=>_saving=false);}
  }


  String? _managedBrandingPath(String? url) {
    if (url == null) return null;
    const marker = '/storage/v1/object/public/company-branding/';
    final index = url.indexOf(marker);
    if (index < 0) return null;
    final path = Uri.decodeComponent(url.substring(index + marker.length).split('?').first);
    return path.startsWith(widget.companyId + '/marketing/') ? path : null;
  }

  Future<void> _save(bool submit) async {
    if(!_formKey.currentState!.validate())return;
    if(_platforms.isEmpty){setState(()=>_message='Selecione pelo menos um canal.');return;}
    final image=_imageUrl.text.trim();
    if(image.isNotEmpty && !['http','https'].contains(Uri.tryParse(image)?.scheme)){setState(()=>_message='Informe uma URL http ou https válida.');return;}
    setState(()=>_saving=true);
    String? uploadedPath;
    final previousImageUrl = _editingId == null ? null : _ads.where((ad) => ad['id'] == _editingId).map((ad) => ad['image_url'] as String?).firstOrNull;
    try {
      String? finalImage = _productImage == null ? (image.isEmpty ? null : image) : 'product-image:'+_productImage!;
      if (_imageFile != null) {
        final bytes = await _imageFile!.readAsBytes();
        final mime = _imageFile!.mimeType ?? 'image/jpeg';
        if (bytes.length > 5 * 1024 * 1024 || !['image/png','image/jpeg','image/webp'].contains(mime)) throw Exception('Use uma imagem PNG, JPG ou WebP de até 5 MB.');
        final ext = mime == 'image/png' ? 'png' : mime == 'image/webp' ? 'webp' : 'jpg';
        uploadedPath = widget.companyId+'/marketing/'+DateTime.now().microsecondsSinceEpoch.toString()+'.'+ext;
        await _db.storage.from('company-branding').uploadBinary(uploadedPath!, bytes, fileOptions: FileOptions(contentType: mime, upsert: false));
        finalImage = _db.storage.from('company-branding').getPublicUrl(uploadedPath!);
      }
      final payload={
        'company_id':widget.companyId,'product_id':_productId,'title':_title.text.trim(),'description':_description.text.trim(),
        'keywords':_keywords.text.split(',').map((v)=>v.trim()).where((v)=>v.isNotEmpty).toList(),
        'image_url':finalImage,
        'image_prompt':_imagePrompt.text.trim(),'platforms':_platforms,'status':submit?'pending_approval':'draft','created_by':widget.userId,
      };
      if(_editingId==null){await _db.from('marketing_ads').insert(payload);}
      else{
        await _db.from('marketing_ads').update({
          'product_id':payload['product_id'],'title':payload['title'],'description':payload['description'],
          'keywords':payload['keywords'],'image_url':payload['image_url'],'image_prompt':payload['image_prompt'],
          'platforms':payload['platforms'],'status':payload['status'],'approved_by':null,'approved_at':null,
          'approval_note':null,'published_at':null,
        }).eq('id',_editingId!).eq('company_id',widget.companyId);
      }
      final previousPath = _managedBrandingPath(previousImageUrl);
      if (previousPath != null && previousPath != uploadedPath && previousImageUrl != finalImage) {
        try { await _db.storage.from('company-branding').remove([previousPath]); } catch (_) {}
      }
      _clear(); await _load();
      if(mounted)setState(()=>_message=submit?'Anúncio enviado para revisão.':'Rascunho salvo.');
    }catch(e){
      if(uploadedPath!=null){try{await _db.storage.from('company-branding').remove([uploadedPath!]);}catch(_){}}
      if(mounted)setState(()=>_message='Falha ao salvar anúncio: $e');
    }
    finally{if(mounted)setState(()=>_saving=false);}
  }


  Future<Map<String, dynamic>> _hordeRequest(String method, String path, {Map<String, dynamic>? body}) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 30);
    try {
      final request = await client.openUrl(method, Uri.parse(_hordeApi + path)).timeout(const Duration(seconds: 35));
      request.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
      request.headers.set('apikey', '0000000000');
      request.headers.set('Client-Agent', 'KidsLocApp:1.0');
      if (body != null) request.add(utf8.encode(jsonEncode(body)));
      final response = await request.close().timeout(const Duration(seconds: 35));
      final responseText = await response.transform(utf8.decoder).join();
      final decoded = jsonDecode(responseText);
      if (response.statusCode < 200 || response.statusCode >= 300) throw Exception('Falha no AI Horde: HTTP ' + response.statusCode.toString());
      return decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
    } finally { client.close(force: true); }
  }

  Future<void> _generateStudioImages() async {
    if (!_studioConsent) { setState(() => _message = 'Confirme o aviso de privacidade antes de enviar a foto.'); return; }
    if (_studioSourceFile == null && (_studioSourcePath == null || _studioSourcePath!.isEmpty)) { setState(() => _message = 'Escolha uma foto do estoque ou envie uma imagem.'); return; }
    setState(() { _studioBusy = true; _studioResults = []; _studioProgress = 'Preparando a foto...'; _message = ''; });
    try {
      late final List<int> bytes;
      String mime = 'image/jpeg';
      if (_studioSourceFile != null) {
        bytes = await _studioSourceFile!.readAsBytes();
        mime = _studioSourceFile!.mimeType ?? 'image/jpeg';
      } else {
        bytes = await _db.storage.from('product-images').download(_studioSourcePath!);
        final p = _studioSourcePath!.toLowerCase();
        mime = p.endsWith('.png') ? 'image/png' : p.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      }
      if (bytes.length > 5 * 1024 * 1024 || !['image/png','image/jpeg','image/webp'].contains(mime)) throw Exception('Use uma foto PNG, JPG ou WebP de até 5 MB.');
      const scenes = {
        'festa': ['em salão de festa infantil com balões em tons pastel', 'em festa infantil ao ar livre com mesas decoradas', 'em espaço de recreação infantil colorido', 'em salão de eventos elegante'],
        'externo': ['em gramado amplo com árvores', 'em quintal espaçoso com jardim', 'em área externa para eventos', 'em parque arborizado com luz natural'],
        'estudio': ['em estúdio com fundo branco', 'em estúdio com fundo bege claro', 'em estúdio com fundo cinza claro', 'em estúdio com fundo creme'],
        'neutro': ['em cenário minimalista branco', 'em cenário areia claro', 'em cenário cinza pérola', 'em cenário off-white'],
      };
      final variants = scenes[_studioScene] ?? scenes['festa']!;
      final source = base64Encode(bytes);
      final random = Random.secure();
      final jobs = <Map<String, dynamic>>[];
      for (var i = 0; i < _studioCount; i++) {
        final prompt = 'Fotografia publicitária realista usando a foto como referência obrigatória. Preserve exatamente o mesmo brinquedo, modelo, estrutura, formato, cores, proporções e acessórios. Não redesenhe, não acrescente nem remova partes, não espelhe. Mantenha o brinquedo inteiro visível e mude somente o cenário: ' + variants[i % variants.length] + '. Sem pessoas, textos, logotipos ou marcas d’água.';
        final response = await _hordeRequest('POST', '/generate/async', body: {
          'prompt': prompt,
          'params': {'n': 1, 'width': 512, 'height': 512, 'steps': 25, 'cfg_scale': 8, 'denoising_strength': 0.45, 'seed': random.nextInt(0x7fffffff).toString()},
          'nsfw': false, 'censor_nsfw': true, 'r2': true, 'shared': false,
          'source_image': source, 'source_processing': 'img2img',
        });
        if (response['id'] == null) throw Exception('AI Horde não retornou o ID da geração.');
        jobs.add({'id': response['id'].toString(), 'done': false});
      }
      final results = <Map<String, dynamic>>[];
      for (var attempt = 0; attempt < 120 && jobs.any((j) => j['done'] != true); attempt++) {
        await Future.delayed(const Duration(seconds: 5));
        for (final job in jobs.where((j) => j['done'] != true).toList()) {
          final check = await _hordeRequest('GET', '/generate/check/' + job['id']);
          if (check['done'] == true || (int.tryParse(check['finished']?.toString() ?? '') ?? 0) > 0) {
            job['done'] = true;
            final result = await _hordeRequest('GET', '/generate/status/' + job['id']);
            final generations = result['generations'];
            if (generations is List) {
              for (final item in generations) {
                if (item is Map && item['img'] is String && item['img'].startsWith('https://')) results.add({'url': item['img']});
              }
            }
          }
        }
        if (mounted) setState(() => _studioProgress = 'Imagens recebidas: ' + results.length.toString() + '/' + _studioCount.toString());
      }
      if (mounted) setState(() {
        _studioResults = results;
        if (results.isEmpty) _message = 'A fila terminou sem retornar imagens. Tente novamente mais tarde.';
        else if (results.length < _studioCount) _message = 'O serviço retornou ' + results.length.toString() + ' de ' + _studioCount.toString() + ' imagens.';
      });
    } catch (e) {
      if (mounted) setState(() => _message = e.toString().replaceFirst('Exception: ', ''));
    } finally { if (mounted) setState(() => _studioBusy = false); }
  }

  Future<void> _chooseStudioFile() async {
    final file = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 95);
    if (file != null && mounted) setState(() { _studioSourceFile = file; _studioSourcePath = null; _studioResults = []; });
  }

  void _useStudioImage(String url) {
    _imageUrl.text = url;
    _imageFile = null;
    _productImage = null;
    setState(() => _message = 'Imagem selecionada. Revise e salve o anúncio.');
    _editor();
  }

  Future<void> _status(Map<String,dynamic> ad,String next) async {
    String? note;
    if(next=='rejected'){
      final c=TextEditingController();
      note=await showDialog<String>(context:context,builder:(ctx)=>AlertDialog(title:const Text('Solicitar ajustes'),content:TextField(controller:c,maxLines:3,decoration:const InputDecoration(labelText:'Ajuste necessário')),actions:[TextButton(onPressed:()=>Navigator.pop(ctx),child:const Text('Cancelar')),FilledButton(onPressed:()=>Navigator.pop(ctx,c.text.trim()),child:const Text('Confirmar'))]));
      c.dispose(); if(note==null)return; if(note.isEmpty){setState(()=>_message='Informe o ajuste necessário.');return;}
    }
    try{
      await _db.from('marketing_ads').update({'status':next,'approval_note':note,'approved_by':next=='approved'?widget.userId:null,'approved_at':next=='approved'?DateTime.now().toUtc().toIso8601String():null,'published_at':null}).eq('id',ad['id']).eq('company_id',widget.companyId);
      await _load(); if(mounted)setState(()=>_message=next=='approved'?'Anúncio aprovado. Nenhuma publicação foi realizada.':'Status atualizado.');
    }catch(e){if(mounted)setState(()=>_message='Falha ao atualizar: $e');}
  }

  Future<void> _copy(Map<String,dynamic> ad,bool instagram) async {
    final words=List<String>.from(ad['keywords']??[]);
    final tags=words.map((v)=>'#'+v.toLowerCase().replaceAll(RegExp(r'[^a-z0-9áéíóúâêôãõç]+'),'')).where((v)=>v.length>1).take(12).join(' ');
    final text=[ad['title'].toString(),ad['description'].toString(),if(instagram&&tags.isNotEmpty)tags,if(!instagram&&words.isNotEmpty)'Palavras-chave: '+words.join(', '),if(_cta.text.trim().isNotEmpty)'Chamada para ação: '+_cta.text.trim(),if(_whatsapp.text.trim().isNotEmpty)'WhatsApp: '+_whatsapp.text.trim()].join('\n\n');
    await Clipboard.setData(ClipboardData(text:text));
    if(mounted)setState(()=>_message=instagram?'Legenda copiada. Anexe a imagem e revise antes de publicar.':'Texto copiado. Anexe a imagem e revise antes de publicar.');
  }


  void _duplicateAd(Map<String, dynamic> ad) {
    _editingId = null;
    _productId = ad['product_id']?.toString();
    _title.text = ((ad['title']?.toString() ?? '') + ' (cópia)');
    if (_title.text.length > 180) _title.text = _title.text.substring(0, 180);
    _description.text = ad['description']?.toString() ?? '';
    _keywords.text = ((ad['keywords'] as List?) ?? []).join(', ');
    _imagePrompt.text = ad['image_prompt']?.toString() ?? '';
    _platforms = List<String>.from(ad['platforms'] ?? []);
    final url = ad['image_url'] as String?;
    if (url != null && url.startsWith('product-image:')) {
      _productImage = url.substring(14);
      _imageUrl.clear();
    } else {
      _productImage = null;
      _imageUrl.text = url ?? '';
    }
    _imageFile = null;
    setState(() => _message = 'Cópia preparada como novo rascunho. Revise antes de salvar.');
    _editor();
  }

  Future<void> _exportAd(Map<String, dynamic> ad) async {
    final channels = List<String>.from(ad['platforms'] ?? []).map((v) => _channels[v] ?? v).join(', ');
    final content = [
      'MATERIAL DE DIVULGAÇÃO', '=====================',
      '', 'TÍTULO', ad['title']?.toString() ?? '',
      '', 'DESCRIÇÃO', ad['description']?.toString() ?? '',
      '', 'PALAVRAS-CHAVE', ((ad['keywords'] as List?) ?? []).join(', '),
      '', 'CANAIS', channels,
      '', 'IMAGEM', ad['image_url']?.toString() ?? 'Não informada',
      '', 'ORIENTAÇÃO PARA A IMAGEM', ad['image_prompt']?.toString() ?? 'Não informada',
      '', 'CHAMADA PARA AÇÃO', _cta.text.trim(),
      'WHATSAPP', _whatsapp.text.trim(),
      '', 'STATUS', _statuses[ad['status']] ?? ad['status'].toString(),
      '', 'A publicação deve ser feita manualmente na plataforma escolhida.',
    ].join('\n');
    await Clipboard.setData(ClipboardData(text: content));
    if (mounted) setState(() => _message = 'Material copiado. Cole em um documento para salvar.');
  }

  Future<void> _exportVisibleAds() async {
    if (_visible.isEmpty) {
      setState(() => _message = 'Não há anúncios para exportar com os filtros atuais.');
      return;
    }
    final content = _visible.asMap().entries.map((entry) {
      final ad = entry.value;
      return [
        'ANÚNCIO ' + (entry.key + 1).toString(),
        ad['title']?.toString() ?? '',
        ad['description']?.toString() ?? '',
        'Palavras-chave: ' + ((ad['keywords'] as List?) ?? []).join(', '),
        'Canais: ' + List<String>.from(ad['platforms'] ?? []).map((v) => _channels[v] ?? v).join(', '),
        'Imagem: ' + (ad['image_url']?.toString() ?? 'Não informada'),
        'Status: ' + (_statuses[ad['status']] ?? ad['status'].toString()),
      ].join('\n');
    }).join('\n\n---\n\n');
    await Clipboard.setData(ClipboardData(text: content));
    if (mounted) setState(() => _message = 'Lista filtrada copiada para a área de transferência.');
  }

  Future<void> _delete(Map<String,dynamic> ad) async {
    final yes=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(title:const Text('Excluir anúncio?'),content:Text('Deseja excluir '+ad['title'].toString()+'?'),actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancelar')),FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Excluir'))]));
    if(yes!=true)return;
    try{
      await _db.from('marketing_ads').delete().eq('id',ad['id']).eq('company_id',widget.companyId);
      final path = _managedBrandingPath(ad['image_url'] as String?);
      if (path != null) { try { await _db.storage.from('company-branding').remove([path]); } catch (_) {} }
      await _load();if(mounted)setState(()=>_message='Anúncio excluído.');
    }
    catch(e){if(mounted)setState(()=>_message='Falha ao excluir: $e');}
  }

  List<Map<String,dynamic>> get _visible {
    final term=_search.trim().toLowerCase();
    return _ads.where((a){
      final channels=List<String>.from(a['platforms']??[]);
      final words=[a['title']??'',a['description']??'',...(a['keywords'] as List? ?? [])].join(' ').toLowerCase();
      return (_filter=='all'||a['status']==_filter)&&(_channel=='all'||channels.contains(_channel))&&(term.isEmpty||words.contains(term));
    }).toList();
  }

  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Marketing e anúncios'),actions:[IconButton(onPressed:_loading?null:_load,icon:const Icon(Icons.refresh))]),
    body:_loading?const Center(child:CircularProgressIndicator()):RefreshIndicator(onRefresh:_load,child:ListView(padding:const EdgeInsets.all(16),children:[
      const Text('DIVULGAÇÃO DA EMPRESA',style:TextStyle(fontSize:11,letterSpacing:1,fontWeight:FontWeight.w700,color:Color(0xFF718096))),
      const SizedBox(height:8),
      const Text('Prepare anúncios, revise o conteúdo e aprove antes de qualquer publicação. A divulgação nas redes continua manual.'),
      const SizedBox(height:12),
      SegmentedButton<String>(segments:const [ButtonSegment(value:'ads',label:Text('Anúncios')),ButtonSegment(value:'settings',label:Text('Configurações'))],selected:{_tab},onSelectionChanged:(v)=>setState(()=>_tab=v.first)),
      if(_message.isNotEmpty)Padding(padding:const EdgeInsets.symmetric(vertical:10),child:Text(_message,style:const TextStyle(color:Color(0xFF3478E5)))),
      if(_tab=='settings')_settings() else _adsList(),
    ])),
  );

  Widget _settings()=>Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
    const SizedBox(height:16),const Text('Informações padrão da empresa',style:TextStyle(fontSize:18,fontWeight:FontWeight.w800)),
    _field(_business,'Nome comercial'),_field(_whatsapp,'WhatsApp'),_field(_regions,'Cidades e regiões (separe por vírgula)'),_field(_defaultDescription,'Descrição padrão',lines:4),_field(_cta,'Chamada para ação'),
    FilledButton(onPressed:_saving?null:_settingsSave,child:const Text('Salvar configurações')),
  ]);

  Widget _adsList()=>Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
    const SizedBox(height:14),
    Wrap(spacing:8,runSpacing:8,children:[
      _metric('Total',_ads.length),_metric('Rascunhos',_ads.where((a)=>a['status']=='draft').length),
      _metric('Para revisar',_ads.where((a)=>a['status']=='pending_approval').length),_metric('Aprovados',_ads.where((a)=>a['status']=='approved').length),
    ]),
    const SizedBox(height:12),FilledButton.icon(onPressed:(){_clear();_editor();},icon:const Icon(Icons.add),label:const Text('Novo anúncio')),
    TextField(decoration:const InputDecoration(labelText:'Pesquisar anúncios',prefixIcon:Icon(Icons.search)),onChanged:(v)=>setState(()=>_search=v)),
    DropdownButtonFormField<String>(initialValue:_filter,decoration:const InputDecoration(labelText:'Status'),items:[const DropdownMenuItem(value:'all',child:Text('Todos os status')),..._statuses.entries.map((e)=>DropdownMenuItem(value:e.key,child:Text(e.value)))],onChanged:(v)=>setState(()=>_filter=v??'all')),
    DropdownButtonFormField<String>(initialValue:_channel,decoration:const InputDecoration(labelText:'Canal'),items:[const DropdownMenuItem(value:'all',child:Text('Todos os canais')),..._channels.entries.map((e)=>DropdownMenuItem(value:e.key,child:Text(e.value)))],onChanged:(v)=>setState(()=>_channel=v??'all')),
    OutlinedButton(onPressed:()=>setState((){_search='';_filter='all';_channel='all';}),child:const Text('Limpar filtros')),
    OutlinedButton.icon(onPressed:_exportVisibleAds,icon:const Icon(Icons.download_outlined),label:const Text('Baixar lista filtrada')),
    Text('Exibindo '+_visible.length.toString()+' de '+_ads.length.toString()+' anúncios'),
    if(_visible.isEmpty)const Padding(padding:EdgeInsets.all(24),child:Text('Nenhum anúncio corresponde aos filtros atuais.',textAlign:TextAlign.center)),
    for(final ad in _visible)_adCard(ad),
    _studioPanel(),
  ]);

  Widget _adCard(Map<String,dynamic> ad){
    final status=ad['status']?.toString()??'draft';final channels=List<String>.from(ad['platforms']??[]);final image=ad['image_display_url'] as String?;
    return Card(margin:const EdgeInsets.only(top:10),child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      if(image!=null)Image.network(image,height:150,width:double.infinity,fit:BoxFit.cover,errorBuilder:(_,__,___)=>const SizedBox(height:50,child:Text('Imagem indisponível'))),
      Chip(label:Text(_statuses[status]??status)),Text(ad['title']?.toString()??'',style:const TextStyle(fontSize:16,fontWeight:FontWeight.w800)),
      Text(ad['description']?.toString()??''),if((ad['approval_note'] as String?)?.isNotEmpty==true)Text('Orientação da revisão: '+ad['approval_note'],style:const TextStyle(color:Colors.deepOrange)),
      Text('Canais: '+channels.map((v)=>_channels[v]??v).join(', '),style:const TextStyle(fontSize:12)),
      Wrap(spacing:4,children:[
        if(status=='approved'&&channels.contains('instagram'))TextButton(onPressed:()=>_copy(ad,true),child:const Text('Copiar para Instagram')),
        if(status=='approved'&&channels.any((v)=>v.startsWith('facebook')))TextButton(onPressed:()=>_copy(ad,false),child:const Text('Preparar Facebook')),
        if(status=='approved'&&channels.any((v)=>v.startsWith('facebook')))TextButton(onPressed:()=>launchUrl(Uri.parse('https://www.facebook.com/'),mode:LaunchMode.externalApplication),child:const Text('Abrir Facebook')),
        TextButton(onPressed:()=>_exportAd(ad),child:const Text('Baixar material')),
        TextButton(onPressed:()=>_duplicateAd(ad),child:const Text('Duplicar')),
        TextButton(onPressed:()=>_edit(ad),child:const Text('Editar')),
        if(status=='draft'||status=='rejected')TextButton(onPressed:()=>_status(ad,'pending_approval'),child:const Text('Enviar para revisão')),
        if(status=='pending_approval')TextButton(onPressed:()=>_status(ad,'approved'),child:const Text('Aprovar')),
        if(status=='pending_approval')TextButton(onPressed:()=>_status(ad,'rejected'),child:const Text('Solicitar ajustes')),
        TextButton(onPressed:()=>_delete(ad),child:const Text('Excluir')),
      ]),
      if(status=='approved')const Text('Aprovado · publicação não conectada',style:TextStyle(fontSize:11,color:Color(0xFF718096))),
    ])));
  }

  Future<void> _editor() async {
    await showModalBottomSheet<void>(context:context,isScrollControlled:true,useSafeArea:true,builder:(ctx)=>Padding(
      padding:EdgeInsets.fromLTRB(16,16,16,MediaQuery.of(ctx).viewInsets.bottom+16),
      child:Form(key:_formKey,child:ListView(shrinkWrap:true,children:[
        Text(_editingId==null?'Preparar anúncio':'Editar anúncio',style:const TextStyle(fontSize:20,fontWeight:FontWeight.w800)),
        DropdownButtonFormField<String>(initialValue:_productId,decoration:const InputDecoration(labelText:'Brinquedo do estoque'),items:[const DropdownMenuItem(value:null,child:Text('Selecione um brinquedo')),..._products.map((p)=>DropdownMenuItem(value:p['id'] as String,child:Text(p['name'].toString())))],onChanged:_generate),
        _field(_title,'Título',validator:(v)=>(v?.trim().length??0)<5?'Informe um título com ao menos 5 caracteres.':null),
        _field(_description,'Descrição',lines:5,validator:(v)=>(v?.trim().length??0)<10?'Informe uma descrição mais completa.':null),
        _field(_keywords,'Palavras-chave (separadas por vírgula)'),
        DropdownButtonFormField<String>(initialValue:_productImage,decoration:const InputDecoration(labelText:'Foto cadastrada no estoque'),items:[const DropdownMenuItem(value:null,child:Text('Não usar foto do estoque')),..._images.map((p)=>DropdownMenuItem(value:p['storage_path'] as String,child:Text(p['product_name'].toString())))],onChanged:(v)=>setState((){_productImage=v;_imageFile=null;_imageUrl.clear();})),
        OutlinedButton.icon(onPressed:_pickImage,icon:const Icon(Icons.image_outlined),label:Text(_imageFile?.name??'Enviar imagem (PNG, JPG ou WebP · até 5 MB)')),
        _field(_imageUrl,'Link da imagem (opcional)'),_field(_imagePrompt,'Orientação para produzir a imagem',lines:3),
        const Text('Canais desejados',style:TextStyle(fontWeight:FontWeight.w700)),
        for(final entry in _channels.entries)CheckboxListTile(contentPadding:EdgeInsets.zero,dense:true,value:_platforms.contains(entry.key),title:Text(entry.value),onChanged:(v)=>setState(()=>v==true?_platforms.add(entry.key):_platforms.remove(entry.key))),
        const Text('A publicação é manual. O Marketplace pode não aceitar anúncios de locação.',style:TextStyle(fontSize:12,color:Colors.deepOrange)),
        FilledButton(onPressed:_saving?null:()async{await _save(false);if(mounted&&_message=='Rascunho salvo.')Navigator.pop(ctx);},child:const Text('Salvar rascunho')),
        OutlinedButton(onPressed:_saving?null:()async{await _save(true);if(mounted&&_message=='Anúncio enviado para revisão.')Navigator.pop(ctx);},child:const Text('Enviar para aprovação')),
      ])),
    ));
  }


  Widget _studioPanel() => Card(
    margin: const EdgeInsets.only(top: 18),
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Estúdio de imagens com IA', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        const Text('Envie uma foto real do brinquedo e gere variações com novos cenários usando a fila gratuita do AI Horde.'),
        const SizedBox(height: 10),
        DropdownButtonFormField<String>(
          initialValue: _studioSourcePath,
          decoration: const InputDecoration(labelText: 'Foto cadastrada no estoque'),
          items: [
            const DropdownMenuItem<String>(value: null, child: Text('Escolher foto do estoque...')),
            ..._images.map((item) => DropdownMenuItem<String>(value: item['storage_path'] as String, child: Text(item['product_name'].toString()))),
          ],
          onChanged: _studioBusy ? null : (value) => setState(() { _studioSourcePath = value; _studioSourceFile = null; _studioResults = []; }),
        ),
        OutlinedButton.icon(onPressed: _studioBusy ? null : _chooseStudioFile, icon: const Icon(Icons.upload_file), label: Text(_studioSourceFile?.name ?? 'Ou enviar uma foto (PNG, JPG ou WebP · até 5 MB)')),
        DropdownButtonFormField<int>(
          initialValue: _studioCount,
          decoration: const InputDecoration(labelText: 'Quantidade de imagens'),
          items: const [DropdownMenuItem(value: 4, child: Text('4 imagens')), DropdownMenuItem(value: 6, child: Text('6 imagens')), DropdownMenuItem(value: 8, child: Text('8 imagens'))],
          onChanged: _studioBusy ? null : (value) => setState(() => _studioCount = value ?? 4),
        ),
        DropdownButtonFormField<String>(
          initialValue: _studioScene,
          decoration: const InputDecoration(labelText: 'Cenário das variações'),
          items: const [
            DropdownMenuItem(value: 'festa', child: Text('Festa infantil')),
            DropdownMenuItem(value: 'externo', child: Text('Área externa / jardim')),
            DropdownMenuItem(value: 'estudio', child: Text('Estúdio profissional')),
            DropdownMenuItem(value: 'neutro', child: Text('Fundo clean de catálogo')),
          ],
          onChanged: _studioBusy ? null : (value) => setState(() => _studioScene = value ?? 'festa'),
        ),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: _studioConsent,
          onChanged: _studioBusy ? null : (value) => setState(() => _studioConsent = value ?? false),
          title: const Text('Entendi que a foto será enviada à rede AI Horde, processada por computadores de voluntários e que solicitações anônimas podem ser compartilhadas para aprimoramento de modelos.', style: TextStyle(fontSize: 12)),
          controlAffinity: ListTileControlAffinity.leading,
        ),
        FilledButton.icon(
          onPressed: _studioBusy || !_studioConsent || (_studioSourceFile == null && (_studioSourcePath == null || _studioSourcePath!.isEmpty)) ? null : _generateStudioImages,
          icon: _studioBusy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.auto_awesome),
          label: Text(_studioBusy ? 'Gerando imagens...' : 'Gerar ' + _studioCount.toString() + ' imagens gratuitamente'),
        ),
        if (_studioProgress.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_studioProgress, style: const TextStyle(fontSize: 12))),
        if (_studioBusy) const Padding(padding: EdgeInsets.only(top: 6), child: Text('A fila é comunitária e pode demorar. Não feche esta tela enquanto a geração estiver em andamento.', style: TextStyle(fontSize: 12, color: Colors.deepOrange))),
        if (_studioResults.isNotEmpty) ...[
          const SizedBox(height: 14),
          Text('Resultados (' + _studioResults.length.toString() + ')', style: const TextStyle(fontWeight: FontWeight.w800)),
          for (var i = 0; i < _studioResults.length; i++) Card(
            child: Padding(padding: const EdgeInsets.all(8), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.network(_studioResults[i]['url'] as String, height: 190, fit: BoxFit.contain, errorBuilder: (_, __, ___) => const SizedBox(height: 90, child: Center(child: Text('Imagem indisponível'))))),
              Text('Variação ' + (i + 1).toString()),
              Wrap(spacing: 8, children: [
                TextButton(onPressed: () => launchUrl(Uri.parse(_studioResults[i]['url'] as String), mode: LaunchMode.externalApplication), child: const Text('Abrir imagem')),
                TextButton(onPressed: () => _useStudioImage(_studioResults[i]['url'] as String), child: const Text('Usar no anúncio')),
              ]),
            ])),
          ),
          const Text('Revise cada imagem: modelos de IA podem alterar detalhes do brinquedo. Use somente imagens que representem fielmente o item real.', style: TextStyle(fontSize: 12, color: Colors.deepOrange)),
        ],
      ]),
    ),
  );

  Widget _field(TextEditingController c,String label,{int lines=1,String? Function(String?)? validator})=>Padding(padding:const EdgeInsets.only(top:8),child:TextFormField(controller:c,maxLines:lines,validator:validator,decoration:InputDecoration(labelText:label,border:const OutlineInputBorder())));
  Widget _metric(String label,int value)=>SizedBox(width:145,child:Card(child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(value.toString(),style:const TextStyle(fontSize:22,fontWeight:FontWeight.w800)),Text(label,style:const TextStyle(fontSize:12))]))));
}
