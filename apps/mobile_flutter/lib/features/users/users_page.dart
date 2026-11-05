import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class UsersPage extends StatefulWidget {
  const UsersPage({super.key, required this.companyId, required this.viewerRole});
  final String companyId;
  final String viewerRole;
  @override
  State<UsersPage> createState() => _UsersPageState();
}
class _UsersPageState extends State<UsersPage> {
  final _client = Supabase.instance.client;
  final _search = TextEditingController();
  List<Map<String, dynamic>> _users = [];
  bool _loading = true;
  String? _error;
  String _roleFilter = 'all';
  bool get _isOwner => widget.viewerRole == 'owner';
  static const _roles = {'owner':'Proprietário','admin':'Administrador','manager':'Gerente','staff':'Funcionário'};
  @override
  void initState() { super.initState(); _load(); }
  @override
  void dispose() { _search.dispose(); super.dispose(); }
  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final response = await _client.functions.invoke('manage-employees', body: {'action':'list_users','company_id':widget.companyId});
      final data = response.data;
      if (data is Map && data['error'] != null) throw Exception(data['error']);
      final rows = data is Map ? data['users'] : null;
      if (rows is! List) throw Exception('O servidor retornou uma lista inválida de usuários.');
      _users = rows.map((row) => Map<String,dynamic>.from(row as Map)).toList();
    } catch (error) { _error = error.toString().replaceFirst('Exception: ',''); }
    finally { if (mounted) setState(() => _loading = false); }
  }
  String _date(dynamic value) {
    final date = DateTime.tryParse(value?.toString() ?? '')?.toLocal();
    if (date == null) return 'Nunca';
    return '${date.day.toString().padLeft(2,'0')}/${date.month.toString().padLeft(2,'0')}/${date.year} às ${date.hour.toString().padLeft(2,'0')}:${date.minute.toString().padLeft(2,'0')}';
  }
  List<Map<String,dynamic>> get _filtered => _users.where((user) {
    final term = _search.text.trim().toLowerCase();
    final matches = term.isEmpty || [user['name'],user['email'],user['phone'],user['company'],user['id']]
      .any((value) => (value?.toString() ?? '').toLowerCase().contains(term));
    final role = (user['role'] ?? '').toString();
    return matches && (_roleFilter == 'all' || (_roleFilter == 'none' ? role.isEmpty : role == _roleFilter));
  }).toList();
  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    final staff = _users.where((u)=>u['role']=='staff').length;
    final admins = _users.where((u)=>u['role']=='admin').length;
    final confirmed = _users.where((u)=>u['email_confirmed_at']!=null).length;
    return Scaffold(appBar: AppBar(title: Text(_isOwner?'Todos os usuários':'Funcionários')),
      body: RefreshIndicator(onRefresh:_load, child:_loading
        ? const ListView(children:[SizedBox(height:260,child:Center(child:CircularProgressIndicator()))])
        : ListView(padding:const EdgeInsets.all(16),children:[
          Text(_isOwner?'Contas cadastradas no KidsLoc App':'Funcionários vinculados à sua empresa',
            style:Theme.of(context).textTheme.bodyMedium?.copyWith(color:Theme.of(context).colorScheme.onSurfaceVariant)),
          const SizedBox(height:14),
          GridView.count(crossAxisCount:2,shrinkWrap:true,physics:const NeverScrollableScrollPhysics(),mainAxisSpacing:8,crossAxisSpacing:8,childAspectRatio:2.3,
            children:[_stat('Total',_users.length),_stat('Funcionários',staff),_stat('Administradores',admins),_stat('E-mails confirmados',confirmed)]),
          const SizedBox(height:14),
          TextField(controller:_search,onChanged:(_)=>setState((){}),decoration:const InputDecoration(prefixIcon:Icon(Icons.search),hintText:'Buscar nome, e-mail, telefone ou empresa')),
          const SizedBox(height:8),
          DropdownButtonFormField<String>(initialValue:_roleFilter,isExpanded:true,decoration:const InputDecoration(labelText:'Filtrar por perfil'),
            items:const [DropdownMenuItem(value:'all',child:Text('Todos os perfis')),DropdownMenuItem(value:'owner',child:Text('Proprietário')),DropdownMenuItem(value:'admin',child:Text('Administrador')),DropdownMenuItem(value:'manager',child:Text('Gerente')),DropdownMenuItem(value:'staff',child:Text('Funcionário')),DropdownMenuItem(value:'none',child:Text('Sem vínculo com empresa'))],
            onChanged:(value)=>setState(()=>_roleFilter=value??'all')),
          if(_error!=null) Card(child:Padding(padding:const EdgeInsets.all(14),child:Column(children:[Text(_error!,style:TextStyle(color:Theme.of(context).colorScheme.error)),TextButton.icon(onPressed:_load,icon:const Icon(Icons.refresh),label:const Text('Tentar novamente'))]))),
          if(_error==null&&filtered.isEmpty) const Padding(padding:EdgeInsets.all(28),child:Center(child:Text('Nenhum usuário encontrado.'))),
          ...filtered.map(_userCard),
          Padding(padding:const EdgeInsets.only(top:10,bottom:24),child:Text('Exibindo ${filtered.length} de ${_users.length} usuários.',textAlign:TextAlign.end,style:Theme.of(context).textTheme.bodySmall)),
        ])));
  }
  Widget _stat(String label,int value)=>Card(child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,mainAxisAlignment:MainAxisAlignment.center,children:[Text(label,style:Theme.of(context).textTheme.bodySmall),const SizedBox(height:4),Text('$value',style:Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight:FontWeight.w800))])));
  Widget _userCard(Map<String,dynamic> user) {
    final name=(user['name']??'').toString().trim(), email=(user['email']??'').toString(), role=(user['role']??'').toString();
    final memberships=(user['memberships'] as List?)??const [];
    return Card(margin:const EdgeInsets.only(bottom:10),child:ExpansionTile(
      leading:CircleAvatar(child:Text((name.isNotEmpty?name:email.isNotEmpty?email:'?').substring(0,1).toUpperCase())),
      title:Text(name.isEmpty?'Nome não informado':name,style:const TextStyle(fontWeight:FontWeight.w700)),
      subtitle:Text(email.isEmpty?'E-mail não informado':email),
      trailing:Container(padding:const EdgeInsets.symmetric(horizontal:9,vertical:6),decoration:BoxDecoration(color:Theme.of(context).colorScheme.secondaryContainer,borderRadius:BorderRadius.circular(20)),child:Text(_roles[role]??'Sem vínculo',style:Theme.of(context).textTheme.labelSmall?.copyWith(fontWeight:FontWeight.w700))),
      childrenPadding:const EdgeInsets.fromLTRB(16,0,16,16),
      children:[const Divider(),_detail('Telefone',(user['phone']??'').toString().isEmpty?'Não informado':user['phone'].toString()),_detail('Empresa',(user['company']??'').toString().isEmpty?'Sem empresa vinculada':user['company'].toString()),_detail('Data de cadastro',_date(user['registered_at'])),_detail('Último acesso',_date(user['last_sign_in_at'])),_detail('E-mail',user['email_confirmed_at']!=null?'Confirmado':'Pendente de confirmação'),_detail('Telefone confirmado',user['phone_confirmed_at']!=null?'Sim':'Não'),
        if(_isOwner&&memberships.length>1)_detail('Vínculos',memberships.map((m)=>'${m['company']} · ${_roles[m['role']]??m['role']}').join('\n')),
        if(_isOwner)_detail('ID da conta',user['id']?.toString()??'—'),
      ]));
  }
  Widget _detail(String label,String value)=>Padding(padding:const EdgeInsets.symmetric(vertical:5),child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[SizedBox(width:125,child:Text(label,style:Theme.of(context).textTheme.bodySmall?.copyWith(color:Theme.of(context).colorScheme.onSurfaceVariant))),Expanded(child:SelectableText(value,style:Theme.of(context).textTheme.bodySmall?.copyWith(fontWeight:FontWeight.w600)))]));
}
