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
  bool _saving = false;
  String? _error;
  String _roleFilter = 'all';
  bool get _isOwner => widget.viewerRole == 'owner';
  bool get _canManageTeam => _isOwner || widget.viewerRole == 'admin';
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

  Future<void> _inviteUser() async {
    final name = TextEditingController();
    final email = TextEditingController();
    String role = 'staff';
    final formKey = GlobalKey<FormState>();
    final confirmed = await showDialog<bool>(context: context, builder: (dialogContext) =>
      StatefulBuilder(builder: (dialogContext, setDialogState) => AlertDialog(
        title: const Text('Convidar usuário'),
        content: Form(key: formKey, child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextFormField(controller: name, autofocus: true, decoration: const InputDecoration(labelText: 'Nome completo'), minLength: 2, maxLength: 100,
            validator: (value) => (value?.trim().length ?? 0) < 2 ? 'Informe o nome completo.' : null),
          const SizedBox(height: 10),
          TextFormField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'E-mail'),
            validator: (value) => value == null || !RegExp(r'^[^\\s@]+@[^\\s@]+\\.[^\\s@]+
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
    return Scaffold(appBar: AppBar(title: Text(_isOwner?'Equipe da empresa':'Funcionários'), actions: [if (_canManageTeam) IconButton(tooltip: 'Convidar usuário', onPressed: _saving ? null : _inviteUser, icon: const Icon(Icons.person_add_alt_1))]),
      body: RefreshIndicator(onRefresh:_load, child:_loading
        ? ListView(children:const [SizedBox(height:260,child:Center(child:CircularProgressIndicator()))])
        : ListView(padding:const EdgeInsets.all(16),children:[
          Text(_isOwner?'Gerencie os usuários, convites e permissões desta empresa.':'Consulte e gerencie os funcionários vinculados à sua empresa.',
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
      subtitle:Column(crossAxisAlignment:CrossAxisAlignment.start,mainAxisSize:MainAxisSize.min,children:[
        Text(email.isEmpty?'E-mail não informado':email,maxLines:2,overflow:TextOverflow.ellipsis),
        const SizedBox(height:5),
        Align(alignment:Alignment.centerLeft,child:Container(padding:const EdgeInsets.symmetric(horizontal:9,vertical:5),decoration:BoxDecoration(color:Theme.of(context).colorScheme.secondaryContainer,borderRadius:BorderRadius.circular(20)),child:Text(_roles[role]??'Sem vínculo',maxLines:1,overflow:TextOverflow.ellipsis,style:Theme.of(context).textTheme.labelSmall?.copyWith(fontWeight:FontWeight.w700)))),
      ]),
      childrenPadding:const EdgeInsets.fromLTRB(16,0,16,16),
      children:[const Divider(),_detail('Telefone',(user['phone']??'').toString().isEmpty?'Não informado':user['phone'].toString()),_detail('Empresa',(user['company']??'').toString().isEmpty?'Sem empresa vinculada':user['company'].toString()),_detail('Data de cadastro',_date(user['registered_at'])),_detail('Último acesso',_date(user['last_sign_in_at'])),_detail('E-mail',user['email_confirmed_at']!=null?'Confirmado':'Pendente de confirmação'),_detail('Telefone confirmado',user['phone_confirmed_at']!=null?'Sim':'Não'),
        if(_isOwner&&memberships.length>1)_detail('Vínculos',memberships.map((m)=>'${m['company']} · ${_roles[m['role']]??m['role']}').join('\n')),
        if(_isOwner)_detail('ID da conta',user['id']?.toString()??'—'),
        if(_canManageTeam && role != 'owner' && (_isOwner || role == 'staff')) ...[
          const SizedBox(height: 8),
          if (_isOwner) DropdownButtonFormField<String>(
            initialValue: role == 'admin' ? 'admin' : 'staff',
            decoration: const InputDecoration(labelText: 'Perfil do usuário'),
            items: const [DropdownMenuItem(value: 'staff', child: Text('Funcionário')), DropdownMenuItem(value: 'admin', child: Text('Administrador'))],
            onChanged: _saving ? null : (value) { if (value != null && value != role) _changeRole(user, value); },
          ),
          Align(alignment: Alignment.centerRight, child: TextButton.icon(
            onPressed: _saving ? null : () => _removeUser(user),
            icon: const Icon(Icons.person_remove_alt_1), label: const Text('Remover acesso'),
          )),
        ],
      ]));
  }
  Widget _detail(String label,String value)=>Padding(padding:const EdgeInsets.symmetric(vertical:5),child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[SizedBox(width:125,child:Text(label,style:Theme.of(context).textTheme.bodySmall?.copyWith(color:Theme.of(context).colorScheme.onSurfaceVariant))),Expanded(child:SelectableText(value,style:Theme.of(context).textTheme.bodySmall?.copyWith(fontWeight:FontWeight.w600)))]));
}
).hasMatch(value.trim()) ? 'Informe um e-mail válido.' : null),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(initialValue: role, decoration: const InputDecoration(labelText: 'Perfil'),
            items: [const DropdownMenuItem(value: 'staff', child: Text('Funcionário')), if (_isOwner) const DropdownMenuItem(value: 'admin', child: Text('Administrador'))],
            onChanged: (value) => setDialogState(() => role = value ?? 'staff')),
        ])),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () { if (formKey.currentState?.validate() ?? false) Navigator.pop(dialogContext, true); }, child: const Text('Enviar convite')),
        ],
      )));
    if (confirmed == true && mounted) {
      await _runTeamAction(() async {
        final response = await _client.functions.invoke('manage-employees', body: {
          'action': 'invite', 'company_id': widget.companyId, 'name': name.text.trim(), 'email': email.text.trim(), 'role': role,
        });
        final data = response.data;
        if (data is Map && data['error'] != null) throw Exception(data['error']);
      }, 'Convite enviado com sucesso.');
    }
    name.dispose(); email.dispose();
  }

  Future<void> _changeRole(Map<String, dynamic> user, String role) async {
    await _runTeamAction(() async {
      final response = await _client.functions.invoke('manage-employees', body: {
        'action': 'change_role', 'company_id': widget.companyId, 'user_id': user['id'], 'role': role,
      });
      final data = response.data;
      if (data is Map && data['error'] != null) throw Exception(data['error']);
    }, 'Perfil atualizado com sucesso.');
  }

  Future<void> _removeUser(Map<String, dynamic> user) async {
    final label = (user['name'] ?? user['email'] ?? 'este usuário').toString();
    final confirmed = await showDialog<bool>(context: context, builder: (dialogContext) => AlertDialog(
      title: const Text('Remover acesso?'),
      content: Text('Deseja remover $label desta empresa?'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
        FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Remover')),
      ],
    ));
    if (confirmed != true) return;
    await _runTeamAction(() async {
      final response = await _client.functions.invoke('manage-employees', body: {
        'action': 'remove', 'company_id': widget.companyId, 'user_id': user['id'],
      });
      final data = response.data;
      if (data is Map && data['error'] != null) throw Exception(data['error']);
    }, 'Acesso removido da empresa.');
  }

  Future<void> _runTeamAction(Future<void> Function() action, String success) async {
    setState(() { _saving = true; _error = null; });
    try {
      await action();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(success)));
      await _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString().replaceFirst('Exception: ',''))));
    } finally { if (mounted) setState(() => _saving = false); }
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
        ? ListView(children:const [SizedBox(height:260,child:Center(child:CircularProgressIndicator()))])
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
      subtitle:Column(crossAxisAlignment:CrossAxisAlignment.start,mainAxisSize:MainAxisSize.min,children:[
        Text(email.isEmpty?'E-mail não informado':email,maxLines:2,overflow:TextOverflow.ellipsis),
        const SizedBox(height:5),
        Align(alignment:Alignment.centerLeft,child:Container(padding:const EdgeInsets.symmetric(horizontal:9,vertical:5),decoration:BoxDecoration(color:Theme.of(context).colorScheme.secondaryContainer,borderRadius:BorderRadius.circular(20)),child:Text(_roles[role]??'Sem vínculo',maxLines:1,overflow:TextOverflow.ellipsis,style:Theme.of(context).textTheme.labelSmall?.copyWith(fontWeight:FontWeight.w700)))),
      ]),
      childrenPadding:const EdgeInsets.fromLTRB(16,0,16,16),
      children:[const Divider(),_detail('Telefone',(user['phone']??'').toString().isEmpty?'Não informado':user['phone'].toString()),_detail('Empresa',(user['company']??'').toString().isEmpty?'Sem empresa vinculada':user['company'].toString()),_detail('Data de cadastro',_date(user['registered_at'])),_detail('Último acesso',_date(user['last_sign_in_at'])),_detail('E-mail',user['email_confirmed_at']!=null?'Confirmado':'Pendente de confirmação'),_detail('Telefone confirmado',user['phone_confirmed_at']!=null?'Sim':'Não'),
        if(_isOwner&&memberships.length>1)_detail('Vínculos',memberships.map((m)=>'${m['company']} · ${_roles[m['role']]??m['role']}').join('\n')),
        if(_isOwner)_detail('ID da conta',user['id']?.toString()??'—'),
      ]));
  }
  Widget _detail(String label,String value)=>Padding(padding:const EdgeInsets.symmetric(vertical:5),child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[SizedBox(width:125,child:Text(label,style:Theme.of(context).textTheme.bodySmall?.copyWith(color:Theme.of(context).colorScheme.onSurfaceVariant))),Expanded(child:SelectableText(value,style:Theme.of(context).textTheme.bodySmall?.copyWith(fontWeight:FontWeight.w600)))]));
}
