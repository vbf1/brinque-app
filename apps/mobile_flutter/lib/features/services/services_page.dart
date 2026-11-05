import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ServicesPage extends StatefulWidget {
  const ServicesPage({super.key, required this.companyId});
  final String companyId;

  @override
  State<ServicesPage> createState() => _ServicesPageState();
}

class _ServicesPageState extends State<ServicesPage> {
  final _client = Supabase.instance.client;
  final _picker = ImagePicker();
  late Future<List<Map<String, dynamic>>> _future = _load();
  bool _busy = false;
  String _search = '';

  Future<List<Map<String, dynamic>>> _load() async {
    final rows = await _client.from('services')
        .select('id, company_id, name, description, price, price_unit, active, notes, service_images!service_images_company_service_scope_fkey(id, storage_path, is_cover)')
        .eq('company_id', widget.companyId)
        .order('name');
    final result = <Map<String, dynamic>>[];
    for (final raw in rows) {
      final service = Map<String, dynamic>.from(raw);
      final images = (service['service_images'] as List? ?? []).whereType<Map>().toList();
      Map? cover;
      for (final image in images) {
        if (image['is_cover'] == true) {
          cover = image;
          break;
        }
      }
      cover ??= images.isEmpty ? null : images.first;
      if (cover != null) {
        try {
          service['_image_url'] = await _client.storage.from('product-images')
              .createSignedUrl(cover['storage_path'] as String, 3600);
        } catch (error) {
          debugPrint('KidsLoc: não foi possível carregar a imagem do serviço: $error');
        }
      }
      result.add(service);
    }
    return result;
  }

  Future<void> _reload() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  Future<void> _edit([Map<String, dynamic>? service]) async {
    final name = TextEditingController(text: service?['name']?.toString() ?? '');
    final description = TextEditingController(text: service?['description']?.toString() ?? '');
    final price = TextEditingController(text: (service?['price'] ?? 0).toString());
    final notes = TextEditingController(text: service?['notes']?.toString() ?? '');
    var priceUnit = service?['price_unit']?.toString() ?? 'fixed';
    var active = service?['active'] as bool? ?? true;
    XFile? image;
    final formKey = GlobalKey<FormState>();
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(builder: (context, setDialogState) => AlertDialog(
        title: Text(service == null ? 'Novo serviço' : 'Editar serviço'),
        content: SizedBox(width: 480, child: Form(
          key: formKey,
          child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextFormField(controller: name, maxLength: 100, decoration: const InputDecoration(labelText: 'Nome do serviço *'), validator: (v) => v == null || v.trim().isEmpty ? 'Informe o nome.' : null),
            TextFormField(controller: description, maxLines: 3, decoration: const InputDecoration(labelText: 'Descrição')),
            TextFormField(controller: price, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Preço (R\$) *'), validator: (v) => (double.tryParse((v ?? '').replaceAll(',', '.')) ?? -1) < 0 ? 'Informe um preço válido.' : null),
            DropdownButtonFormField<String>(
              initialValue: priceUnit,
              decoration: const InputDecoration(labelText: 'Forma de cobrança'),
              items: const [
                DropdownMenuItem(value: 'fixed', child: Text('Valor fixo')),
                DropdownMenuItem(value: 'hour', child: Text('Por hora')),
                DropdownMenuItem(value: 'day', child: Text('Por dia')),
                DropdownMenuItem(value: 'event', child: Text('Por evento')),
              ],
              onChanged: (value) => setDialogState(() => priceUnit = value ?? priceUnit),
            ),
            TextFormField(controller: notes, maxLines: 2, decoration: const InputDecoration(labelText: 'Observações internas')),
            const SizedBox(height: 8),
            if (image != null) Text('Imagem selecionada: ${image!.name}', maxLines: 1, overflow: TextOverflow.ellipsis)
            else if (service?['_image_url'] != null) ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Image.network(service!['_image_url'] as String, height: 110, width: double.infinity, fit: BoxFit.cover),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () async {
                  final picked = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 85);
                  if (picked != null) setDialogState(() => image = picked);
                },
                icon: const Icon(Icons.image_outlined),
                label: const Text('Selecionar foto'),
              ),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Serviço ativo'),
              value: active,
              onChanged: (value) => setDialogState(() => active = value),
            ),
          ])),
        )),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () { if (formKey.currentState!.validate()) Navigator.pop(dialogContext, true); }, child: const Text('Salvar')),
        ],
      )),
    );
    if (saved == true && mounted) {
      setState(() => _busy = true);
      try {
        final amount = double.parse(price.text.replaceAll(',', '.'));
        Uint8List? imageBytes;
        String? imageMime;
        String? imageExtension;
        if (image != null) {
          imageBytes = await image!.readAsBytes();
          if (imageBytes.length > 8 * 1024 * 1024) {
            throw StateError('A imagem deve ter no máximo 8 MB.');
          }
          imageExtension = image!.name.split('.').last.toLowerCase();
          imageMime = switch (imageExtension) {
            'jpg' || 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'webp' => 'image/webp',
            _ => throw StateError('Use uma imagem JPG, PNG ou WebP.'),
          };
        }
        final values = {
          'name': name.text.trim(),
          'description': description.text.trim().isEmpty ? null : description.text.trim(),
          'price': amount,
          'price_unit': priceUnit,
          'notes': notes.text.trim().isEmpty ? null : notes.text.trim(),
          'active': active,
        };
        String serviceId;
        if (service == null) {
          final created = await _client.from('services')
              .insert({'company_id': widget.companyId, ...values})
              .select('id').single();
          serviceId = created['id'] as String;
        } else {
          serviceId = service['id'] as String;
          await _client.from('services').update(values)
              .eq('id', serviceId).eq('company_id', widget.companyId);
        }
        if (imageBytes != null && imageExtension != null && imageMime != null) {
          final path = '${widget.companyId}/services/$serviceId/${DateTime.now().microsecondsSinceEpoch}.$imageExtension';
          await _client.storage.from('product-images').uploadBinary(
            path,
            imageBytes,
            fileOptions: FileOptions(contentType: imageMime),
          );
          try {
            final inserted = await _client.from('service_images').insert({
              'company_id': widget.companyId,
              'service_id': serviceId,
              'storage_path': path,
              'caption': name.text.trim(),
              'is_cover': false,
            }).select('id').single();
            await _client.from('service_images').update({'is_cover': false})
                .eq('company_id', widget.companyId)
                .eq('service_id', serviceId)
                .neq('id', inserted['id']);
            await _client.from('service_images').update({'is_cover': true})
                .eq('id', inserted['id']).eq('company_id', widget.companyId);
          } catch (_) {
            await _client.storage.from('product-images').remove([path]);
            rethrow;
          }
        }
        await _reload();
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Serviço salvo.')));
      } catch (error) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Não foi possível salvar o serviço: $error')));
      } finally {
        if (mounted) setState(() => _busy = false);
      }
    }
    name.dispose();
    description.dispose();
    price.dispose();
    notes.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Serviços'), actions: [
      IconButton(tooltip: 'Atualizar', onPressed: _reload, icon: const Icon(Icons.refresh)),
    ]),
    floatingActionButton: FloatingActionButton.extended(
      onPressed: _busy ? null : () => _edit(),
      icon: const Icon(Icons.add),
      label: const Text('Novo serviço'),
    ),
    body: Column(children: [
      Padding(
        padding: const EdgeInsets.all(16),
        child: TextField(
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Buscar serviço', border: OutlineInputBorder()),
          onChanged: (value) => setState(() => _search = value.trim().toLowerCase()),
        ),
      ),
      Expanded(child: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) { return const Center(child: CircularProgressIndicator()); }
          if (snapshot.hasError) { return Center(child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text('Não foi possível carregar os serviços. ${snapshot.error}', textAlign: TextAlign.center),
              OutlinedButton(onPressed: _reload, child: const Text('Tentar novamente')),
            ]),
          )); }
          final rows = (snapshot.data ?? []).where((row) =>
            (row['name'] as String? ?? '').toLowerCase().contains(_search)).toList();
          if (rows.isEmpty) return const Center(child: Text('Nenhum serviço encontrado.'));
          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
              itemCount: rows.length,
              separatorBuilder: (_, index) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final row = rows[index];
                final imageUrl = row['_image_url'] as String?;
                return Card(child: ListTile(
                  leading: imageUrl == null
                      ? const CircleAvatar(child: Icon(Icons.miscellaneous_services_outlined))
                      : ClipRRect(borderRadius: BorderRadius.circular(9), child: Image.network(imageUrl, width: 48, height: 48, fit: BoxFit.cover)),
                  title: Text(row['name'] as String? ?? 'Serviço'),
                  subtitle: Text('${row['description'] ?? 'Sem descrição'}\nR\$ ${(row['price'] as num? ?? 0).toStringAsFixed(2)} · ${row['price_unit']} · ${row['active'] == true ? 'Ativo' : 'Inativo'}'),
                  isThreeLine: true,
                  trailing: IconButton(tooltip: 'Editar serviço', onPressed: _busy ? null : () => _edit(row), icon: const Icon(Icons.edit_outlined)),
                  onTap: _busy ? null : () => _edit(row),
                ));
              },
            ),
          );
        },
      )),
    ]),
  );
}
