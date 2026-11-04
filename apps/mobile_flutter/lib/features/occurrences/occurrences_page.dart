import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class OccurrencesPage extends StatefulWidget {
  const OccurrencesPage({super.key, required this.companyId, required this.role});
  final String companyId;
  final String role;
  @override
  State<OccurrencesPage> createState() => _OccurrencesPageState();
}

class _OccurrencesPageState extends State<OccurrencesPage> {
  final _client = Supabase.instance.client;
  final _picker = ImagePicker();
  late Future<List<Map<String, dynamic>>> _future = _load();
  final _search = TextEditingController();
  String _category = '';
  String _severity = '';
  bool _busy = false;

  static const _categories = ['Quebra de brinquedo', 'Prejuízo financeiro', 'Dano material', 'Problema na entrega', 'Problema durante evento', 'Acidente ou segurança', 'Outro'];
  static const _severities = {'low': 'Baixa', 'medium': 'Moderada', 'high': 'Alta', 'critical': 'Crítica'};
  bool _canManage(Map<String, dynamic> row) => widget.role == 'owner' || widget.role == 'admin' || row['created_by'] == _client.auth.currentUser?.id;

  Future<List<Map<String, dynamic>>> _load() async {
    final reports = await _client.from('occurrence_reports').select('*').eq('company_id', widget.companyId).order('occurred_at', ascending: false);
    final photos = await _client.from('occurrence_photos').select('id, occurrence_id, storage_path').eq('company_id', widget.companyId).order('created_at');
    final grouped = <String, List<Map<String, dynamic>>>{};
    for (final raw in photos) {
      final photo = Map<String, dynamic>.from(raw);
      photo['url'] = await _client.storage.from('occurrence-photos').createSignedUrl(photo['storage_path'] as String, 86400);
      (grouped[photo['occurrence_id'] as String] ??= []).add(photo);
    }
    return List<Map<String, dynamic>>.from(reports).map((raw) {
      final row = Map<String, dynamic>.from(raw);
      row['photos'] = grouped[row['id']] ?? [];
      return row;
    }).toList();
  }

  Future<void> _reload() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  Future<void> _edit([Map<String, dynamic>? row]) async {
    final title = TextEditingController(text: row?['title'] as String? ?? '');
    final location = TextEditingController(text: row?['location'] as String? ?? '');
    final description = TextEditingController(text: row?['description'] as String? ?? '');
    final loss = TextEditingController(text: row?['loss_amount']?.toString() ?? '');
    var category = row?['category'] as String? ?? _categories.first;
    var severity = row?['severity'] as String? ?? 'medium';
    var occurred = DateTime.tryParse(row?['occurred_at']?.toString() ?? '') ?? DateTime.now();
    final picked = <XFile>[];
    final formKey = GlobalKey<FormState>();
    final canEdit = row == null || _canManage(row);
    final saved = await showDialog<bool>(context: context, builder: (dialogContext) => StatefulBuilder(builder: (context, setDialogState) => AlertDialog(
      title: Text(row == null ? 'Novo relato' : 'Detalhes da ocorrência'),
      content: SizedBox(width: 520, child: Form(key: formKey, child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
        TextFormField(controller: title, enabled: canEdit, decoration: const InputDecoration(labelText: 'Título'), validator: (v) => (v ?? '').trim().length < 3 ? 'Informe um título.' : null),
        DropdownButtonFormField<String>(initialValue: category, decoration: const InputDecoration(labelText: 'Categoria'), items: _categories.map((v) => DropdownMenuItem(value: v, child: Text(v))).toList(), onChanged: canEdit ? (v) => setDialogState(() => category = v ?? category) : null),
        DropdownButtonFormField<String>(initialValue: severity, decoration: const InputDecoration(labelText: 'Gravidade'), items: _severities.entries.map((v) => DropdownMenuItem(value: v.key, child: Text(v.value))).toList(), onChanged: canEdit ? (v) => setDialogState(() => severity = v ?? severity) : null),
        ListTile(contentPadding: EdgeInsets.zero, title: const Text('Data e horário'), subtitle: Text('${occurred.day.toString().padLeft(2, '0')}/${occurred.month.toString().padLeft(2, '0')}/${occurred.year} ${occurred.hour.toString().padLeft(2, '0')}:${occurred.minute.toString().padLeft(2, '0')}'), trailing: const Icon(Icons.calendar_month), onTap: canEdit ? () async {
          final date = await showDatePicker(context: context, initialDate: occurred, firstDate: DateTime(2020), lastDate: DateTime(2100));
          if (date == null || !context.mounted) return;
          final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(occurred));
          if (time != null) setDialogState(() => occurred = DateTime(date.year, date.month, date.day, time.hour, time.minute));
        } : null),
        TextFormField(controller: location, enabled: canEdit, decoration: const InputDecoration(labelText: 'Local'), validator: (v) => (v ?? '').trim().length < 2 ? 'Informe o local.' : null),
        TextFormField(controller: description, enabled: canEdit, minLines: 3, maxLines: 5, decoration: const InputDecoration(labelText: 'Descrição'), validator: (v) => (v ?? '').trim().length < 5 ? 'Descreva o ocorrido.' : null),
        TextFormField(controller: loss, enabled: canEdit, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Prejuízo estimado (R\$), opcional'), validator: (v) => (double.tryParse((v ?? '').replaceAll(',', '.')) ?? 0) < 0 ? 'Valor inválido.' : null),
        if (row != null) ...[
          const Align(alignment: Alignment.centerLeft, child: Text('Fotos anexadas')),
          ...((row['photos'] as List? ?? []).map((p) => ListTile(dense: true, contentPadding: EdgeInsets.zero, leading: const Icon(Icons.image_outlined), title: const Text('Foto anexada'), onTap: () => showDialog<void>(context: context, builder: (_) => Dialog(child: InteractiveViewer(child: Image.network(p['url'] as String)))), trailing: canEdit ? IconButton(icon: const Icon(Icons.delete_outline), onPressed: () async {
            await _client.storage.from('occurrence-photos').remove([p['storage_path'] as String]);
            await _client.from('occurrence_photos').delete().eq('id', p['id']).eq('company_id', widget.companyId);
            if (context.mounted) setDialogState(() => (row['photos'] as List).remove(p));
          }) : null))),
        ],
        if (canEdit) OutlinedButton.icon(onPressed: () async {
          final result = await _picker.pickMultiImage(imageQuality: 85);
          for (final file in result) {
            final ext = file.name.split('.').last.toLowerCase();
            if (await File(file.path).length() <= 8 * 1024 * 1024 && ['jpg', 'jpeg', 'png', 'webp'].contains(ext)) picked.add(file);
          }
          setDialogState(() {});
        }, icon: const Icon(Icons.add_photo_alternate_outlined), label: Text('Adicionar fotos (${picked.length})')),
        if (picked.isNotEmpty) Text('${picked.length} foto(s) selecionada(s), até 8 MB cada'),
      ])))),
      actions: [
        TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Fechar')),
        if (canEdit) FilledButton(onPressed: () { if (formKey.currentState!.validate()) Navigator.pop(dialogContext, true); }, child: const Text('Salvar')),
      ],
    )));
    if (saved == true && mounted) {
      setState(() => _busy = true);
      try {
        final user = _client.auth.currentUser;
        if (user == null) throw Exception('Sua sessão expirou.');
        final payload = {
          'title': title.text.trim(), 'category': category, 'severity': severity,
          'occurred_at': occurred.toUtc().toIso8601String(), 'location': location.text.trim(),
          'description': description.text.trim(), 'loss_amount': double.tryParse(loss.text.replaceAll(',', '.')) ?? 0,
        };
        String id;
        if (row == null) {
          final name = user.userMetadata?['full_name'] ?? user.userMetadata?['name'] ?? user.email?.split('@').first ?? 'Usuário';
          final inserted = await _client.from('occurrence_reports').insert({...payload, 'company_id': widget.companyId, 'created_by': user.id, 'created_by_name': name, 'created_by_email': user.email}).select('id').single();
          id = inserted['id'] as String;
        } else {
          if (!canEdit) throw Exception('Sem permissão para editar este relato.');
          await _client.from('occurrence_reports').update(payload).eq('id', row['id']).eq('company_id', widget.companyId);
          id = row['id'] as String;
        }
        for (final file in picked) {
          final ext = file.name.split('.').last.toLowerCase();
          final path = '${widget.companyId}/$id/${DateTime.now().microsecondsSinceEpoch}.$ext';
          await _client.storage.from('occurrence-photos').upload(path, File(file.path), fileOptions: FileOptions(contentType: ext == 'jpg' || ext == 'jpeg' ? 'image/jpeg' : 'image/$ext'));
          try {
            await _client.from('occurrence_photos').insert({'company_id': widget.companyId, 'occurrence_id': id, 'storage_path': path, 'uploaded_by': user.id});
          } catch (_) {
            await _client.storage.from('occurrence-photos').remove([path]);
            rethrow;
          }
        }
        await _reload();
      } catch (e) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Não foi possível salvar: $e')));
      } finally { if (mounted) setState(() => _busy = false); }
    }
    title.dispose(); location.dispose(); description.dispose(); loss.dispose();
  }

  Future<void> _delete(Map<String, dynamic> row) async {
    final confirmed = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
      title: const Text('Excluir ocorrência?'), content: const Text('O relato e todas as fotos serão removidos permanentemente.'),
      actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancelar')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Excluir'))],
    ));
    if (confirmed != true) return;
    setState(() => _busy = true);
    try {
      final photos = row['photos'] as List? ?? [];
      if (photos.isNotEmpty) await _client.storage.from('occurrence-photos').remove(photos.map((p) => p['storage_path'] as String).toList());
      await _client.from('occurrence_reports').delete().eq('id', row['id']).eq('company_id', widget.companyId);
      await _reload();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Não foi possível excluir: $e')));
    } finally { if (mounted) setState(() => _busy = false); }
  }

  @override
  void dispose() { _search.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Ocorrências'), actions: [IconButton(onPressed: _busy ? null : _reload, icon: const Icon(Icons.refresh))]),
    floatingActionButton: FloatingActionButton.extended(onPressed: _busy ? null : () => _edit(), icon: const Icon(Icons.add), label: const Text('Novo relato')),
    body: FutureBuilder<List<Map<String, dynamic>>>(future: _future, builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
      if (snapshot.hasError) return Center(child: Padding(padding: const EdgeInsets.all(20), child: Text('Não foi possível carregar as ocorrências. ${snapshot.error}')));
      final rows = snapshot.data ?? [];
      final filtered = rows.where((r) {
        final term = _search.text.trim().toLowerCase();
        final text = ['title', 'location', 'created_by_name', 'description'].map((k) => r[k]?.toString().toLowerCase() ?? '').join(' ');
        return text.contains(term) && (_category.isEmpty || r['category'] == _category) && (_severity.isEmpty || r['severity'] == _severity);
      }).toList();
      return RefreshIndicator(onRefresh: _reload, child: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(controller: _search, decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Buscar ocorrência...'), onChanged: (_) => setState(() {})),
        const SizedBox(height: 8),
        Wrap(spacing: 8, children: [
          DropdownButton<String>(value: _category.isEmpty ? null : _category, hint: const Text('Categoria'), items: [const DropdownMenuItem(value: '', child: Text('Todas')), ..._categories.map((v) => DropdownMenuItem(value: v, child: Text(v)))], onChanged: (v) => setState(() => _category = v ?? '')),
          DropdownButton<String>(value: _severity.isEmpty ? null : _severity, hint: const Text('Gravidade'), items: [const DropdownMenuItem(value: '', child: Text('Todas')), ..._severities.entries.map((v) => DropdownMenuItem(value: v.key, child: Text(v.value)))], onChanged: (v) => setState(() => _severity = v ?? '')),
        ]),
        if (filtered.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('Nenhuma ocorrência encontrada.'))),
        ...filtered.map((r) => Card(child: ListTile(
          title: Text(r['title'] as String? ?? 'Ocorrência'),
          subtitle: Text('${r['location']} · ${_severities[r['severity']] ?? 'Moderada'} · ${r['created_by_name'] ?? 'Usuário'}'),
          leading: const Icon(Icons.report_problem_outlined),
          trailing: PopupMenuButton<String>(onSelected: (v) { if (v == 'edit') _edit(r); if (v == 'delete') _delete(r); }, itemBuilder: (_) => [
            const PopupMenuItem(value: 'edit', child: Text('Detalhes / editar')),
            if (_canManage(r)) const PopupMenuItem(value: 'delete', child: Text('Excluir')),
          ]),
          onTap: () => _edit(r),
        ))),
      ]));
    }),
  );
}
