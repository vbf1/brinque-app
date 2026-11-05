import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class TeamChatPage extends StatefulWidget {
  const TeamChatPage({super.key, required this.companyId});
  final String companyId;
  @override
  State<TeamChatPage> createState() => _TeamChatPageState();
}

class _TeamChatPageState extends State<TeamChatPage> {
  final _client = Supabase.instance.client;
  final _composer = TextEditingController();
  List<Map<String, dynamic>> _members = [], _conversations = [], _messages = [];
  final Map<String, String> _conversationPeers = {};
  final Map<String, String> _conversationPreviews = {};
  String? _viewerId, _recipientId, _error;
  Map<String, dynamic>? _active;
  dynamic _channel;
  bool _loading = true, _sending = false;

  @override
  void initState() { super.initState(); _load(); }
  @override
  void dispose() {
    _composer.dispose();
    if (_channel != null) _client.removeChannel(_channel);
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final user = _client.auth.currentUser;
      if (user == null) throw StateError('Sua sessão expirou. Entre novamente.');
      _viewerId = user.id;
      final groupId = await _client.rpc('ensure_team_group', params: {'p_company_id': widget.companyId});
      final directoryResponse = await _client.functions.invoke(
        'team-chat-members',
        body: {'company_id': widget.companyId},
      );
      final directoryData = directoryResponse.data as Map<String, dynamic>? ?? {};
      _members = List<Map<String, dynamic>>.from(directoryData['members'] ?? []);
      final rows = await _client.from('team_conversations').select('id, conversation_type, title, created_at')
          .eq('company_id', widget.companyId).order('created_at', ascending: false);
      final conversations = List<Map<String, dynamic>>.from(rows);
      final conversationIds = conversations.map((row) => row['id'] as String).toList();
      if (conversationIds.isNotEmpty) {
        final memberships = await _client.from('team_conversation_members').select('conversation_id, user_id').inFilter('conversation_id', conversationIds);
        final membershipRows = List<Map<String, dynamic>>.from(memberships);
        final visibleIds = membershipRows.where((row) => row['user_id'] == _viewerId)
            .map((row) => row['conversation_id'] as String).toSet();
        _conversationPeers
          ..clear()
          ..addEntries(membershipRows.where((row) => row['user_id'] != _viewerId)
            .map((row) => MapEntry(row['conversation_id'] as String, row['user_id'] as String)));
        _conversations = conversations.where((row) => visibleIds.contains(row['id'])).toList();
      } else { _conversations = []; }
      _conversationPreviews.clear();
      if (conversationIds.isNotEmpty) {
        final recentMessages = await _client.from('team_messages')
            .select('conversation_id, sender_id, body, created_at').inFilter('conversation_id', conversationIds)
            .order('created_at', ascending: false).limit(1000);
        for (final row in List<Map<String, dynamic>>.from(recentMessages)) {
          final conversationId = row['conversation_id'] as String;
          if (!_conversationPreviews.containsKey(conversationId)) {
            _conversationPreviews[conversationId] = (row['sender_id'] == _viewerId ? 'Você: ' : '') + (row['body'] as String? ?? '');
          }
        }
      }
      if (groupId != null && !_conversations.any((row) => row['id'] == groupId)) {
        final group = await _client.from('team_conversations').select('id, conversation_type, title, created_at').eq('id', groupId).maybeSingle();
        if (group != null) _conversations.insert(0, Map<String, dynamic>.from(group));
      }
    } catch (error) { _error = error.toString(); }
    finally { if (mounted) setState(() => _loading = false); }
  }

  String _memberName(String? id) {
    for (final member in _members) { if (member['user_id'] == id) return member['name'] as String? ?? 'Usuário não identificado'; }
    return 'Usuário não identificado';
  }
  String _conversationName(Map<String, dynamic> item) {
    if (item['conversation_type'] == 'team') return 'Grupo da equipe';
    final peerId = _conversationPeers[item['id']];
    return peerId == null ? 'Conversa privada' : _memberName(peerId);
  }

  Future<void> _open(Map<String, dynamic> conversation) async {
    if (_channel != null) { await _client.removeChannel(_channel); _channel = null; }
    setState(() { _active = conversation; _messages = []; });
    final id = conversation['id'] as String;
    _channel = _client.channel('kidsloc-team-$id')
      .onPostgresChanges(event: PostgresChangeEvent.insert, schema: 'public', table: 'team_messages',
        filter: PostgresChangeFilter(type: PostgresChangeFilterType.eq, column: 'conversation_id', value: id),
        callback: (payload) => _loadMessages(id))
      .subscribe((status, [error]) { if (status == RealtimeSubscribeStatus.subscribed) _loadMessages(id); });
    await _loadMessages(id);
  }
  Future<void> _loadMessages(String id) async {
    try {
      final rows = await _client.from('team_messages').select('id, conversation_id, sender_id, body, created_at')
          .eq('conversation_id', id).order('created_at', ascending: true).limit(300);
      if (!mounted || _active?['id'] != id) return;
      setState(() => _messages = List<Map<String, dynamic>>.from(rows));
    } catch (error) { if (mounted) setState(() => _error = error.toString()); }
  }

  Future<void> _startDirect() async {
    final recipient = _recipientId, viewer = _viewerId;
    if (recipient == null || viewer == null) return;
    setState(() { _sending = true; _error = null; });
    try {
      final created = await _client.from('team_conversations').insert({
        'company_id': widget.companyId, 'conversation_type': 'direct', 'title': 'Conversa', 'created_by': viewer,
      }).select('id, conversation_type, title, created_at').single();
      await _client.from('team_conversation_members').insert([
        {'conversation_id': created['id'], 'company_id': widget.companyId, 'user_id': viewer},
        {'conversation_id': created['id'], 'company_id': widget.companyId, 'user_id': recipient},
      ]);
      await _load();
      if (mounted) await _open(Map<String, dynamic>.from(created));
    } catch (error) { if (mounted) setState(() => _error = 'Não foi possível iniciar a conversa: $error'); }
    finally { if (mounted) setState(() => _sending = false); }
  }
  Future<void> _send() async {
    final body = _composer.text.trim(), active = _active, viewer = _viewerId;
    if (body.isEmpty || active == null || viewer == null) return;
    setState(() => _sending = true);
    try {
      await _client.from('team_messages').insert({
        'conversation_id': active['id'], 'company_id': widget.companyId, 'sender_id': viewer, 'body': body,
      });
      _composer.clear();
      await _loadMessages(active['id'] as String);
    } catch (error) { if (mounted) setState(() => _error = 'Não foi possível enviar a mensagem: $error'); }
    finally { if (mounted) setState(() => _sending = false); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(_active == null ? 'Mensagens da equipe' : _conversationName(_active!)),
      leading: _active == null ? null : IconButton(icon: const Icon(Icons.arrow_back), onPressed: () async {
        if (_channel != null) await _client.removeChannel(_channel);
        _channel = null; setState(() { _active = null; _messages = []; });
      }),
      actions: [IconButton(tooltip: 'Atualizar', onPressed: _load, icon: const Icon(Icons.refresh))]),
    body: _loading ? const Center(child: CircularProgressIndicator()) : Column(children: [
      if (_error != null) Padding(padding: const EdgeInsets.all(10), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
      Expanded(child: _active == null ? _conversationList() : _messageView()),
    ]),
  );

  Widget _conversationList() {
    final colleagues = _members.where((member) => member['user_id'] != _viewerId).toList();
    return ListView(padding: const EdgeInsets.all(16), children: [
      Card(child: ListTile(leading: const CircleAvatar(child: Icon(Icons.groups_outlined)), title: const Text('Grupo da equipe'),
        subtitle: const Text('Mensagens visíveis para todos os membros'), trailing: const Icon(Icons.chevron_right),
        onTap: () { final groups = _conversations.where((item) => item['conversation_type'] == 'team'); if (groups.isNotEmpty) _open(groups.first); })),
      const SizedBox(height: 12),
      Text('Nova conversa privada', style: Theme.of(context).textTheme.titleMedium),
      const SizedBox(height: 8),
      DropdownButtonFormField<String>(initialValue: _recipientId, isExpanded: true,
        decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Pessoa da equipe'),
        items: colleagues.map((member) => DropdownMenuItem<String>(value: member['user_id'] as String,
          child: Text('${member['name']} · ${member['role']}'))).toList(),
        onChanged: (value) => setState(() => _recipientId = value)),
      const SizedBox(height: 8),
      FilledButton.icon(onPressed: _sending || _recipientId == null ? null : _startDirect,
        icon: const Icon(Icons.add_comment_outlined), label: const Text('Iniciar conversa')),
      const SizedBox(height: 18),
      Text('Conversas', style: Theme.of(context).textTheme.titleMedium),
      ..._conversations.map((conversation) => Card(child: ListTile(
        leading: CircleAvatar(child: Icon(conversation['conversation_type'] == 'team' ? Icons.groups_outlined : Icons.person_outline)),
        title: Text(_conversationName(conversation)),
        subtitle: Text(_conversationPreviews[conversation['id']] ?? (conversation['conversation_type'] == 'team' ? 'Mensagens para toda a equipe' : 'Comece a conversa'), maxLines: 1, overflow: TextOverflow.ellipsis),
        trailing: const Icon(Icons.chevron_right), onTap: () => _open(conversation)))),
      if (_conversations.isEmpty) const Padding(padding: EdgeInsets.all(18),
        child: Text('Nenhuma conversa disponível. Inicie uma conversa ou abra o grupo da equipe.')),
    ]);
  }

  Widget _messageView() => Column(children: [
    Expanded(child: ListView.builder(padding: const EdgeInsets.all(14), itemCount: _messages.length, itemBuilder: (context, index) {
      final item = _messages[index], mine = item['sender_id'] == _viewerId;
      final time = DateTime.tryParse(item['created_at'] as String? ?? '')?.toLocal();
      return Align(alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * .82),
          margin: const EdgeInsets.symmetric(vertical: 5), padding: const EdgeInsets.all(11),
          decoration: BoxDecoration(color: mine ? Theme.of(context).colorScheme.primaryContainer : Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(14)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (!mine) Text(_memberName(item['sender_id'] as String?), style: Theme.of(context).textTheme.labelSmall),
            Text(item['body'] as String? ?? ''),
            if (time != null) Align(alignment: Alignment.bottomRight,
              child: Text('${time.day.toString().padLeft(2, '0')}/${time.month.toString().padLeft(2, '0')} ${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}',
                style: Theme.of(context).textTheme.labelSmall)),
          ])));
    })),
    SafeArea(child: Padding(padding: const EdgeInsets.fromLTRB(12, 8, 12, 12), child: Row(children: [
      Expanded(child: TextField(controller: _composer, minLines: 1, maxLines: 4, maxLength: 4000,
        decoration: const InputDecoration(hintText: 'Digite uma mensagem...', border: OutlineInputBorder(), counterText: ''),
        onSubmitted: (_) => _send())),
      const SizedBox(width: 8),
      IconButton.filled(tooltip: 'Enviar mensagem', onPressed: _sending ? null : _send,
        icon: _sending ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send)),
    ]))),
  ]);
}
