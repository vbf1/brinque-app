import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'rental_repository.dart';
import 'rental_time.dart';

class RentalsPage extends StatefulWidget {
  const RentalsPage({super.key, required this.companyId});
  final String companyId;
  @override
  State<RentalsPage> createState() => _RentalsPageState();
}

class _RentalsPageState extends State<RentalsPage> {
  late final RentalRepository repo = RentalRepository(
    client: Supabase.instance.client, companyId: widget.companyId,
  );
  late Future<_RentalData> future = _load();
  final dateFormat = DateFormat('dd/MM/yyyy');
  String search = '';

  Future<_RentalData> _load() async {
    final results = await Future.wait([
      repo.fetchRentals(), repo.fetchCustomers(), repo.fetchProducts(), repo.fetchCompanyMembers(),
    ]);
    return _RentalData(
      rentals: results[0], customers: results[1], products: results[2], employees: results[3],
    );
  }

  Future<void> reload() async {
    final next = _load();
    setState(() => future = next);
    await next;
  }

  Future<void> editRental(_RentalData data, [Map<String, dynamic>? rental]) async {
    final customerId = ValueNotifier<String?>(rental?['customer_id'] as String?);
    final start = ValueNotifier<DateTime>(_date(rental?['start_date']) ?? DateTime.now());
    final end = ValueNotifier<DateTime>(_date(rental?['end_date']) ?? DateTime.now().add(const Duration(days: 1)));
    final startTime = ValueNotifier<String>(
      rental == null ? '09:00' : normalizeRentalTime(rental['start_time'], '00:00'),
    );
    final endTime = ValueNotifier<String>(
      rental == null ? '17:00' : normalizeRentalTime(rental['end_time'], '23:59'),
    );
    final status = ValueNotifier<String>(rental?['status'] as String? ?? 'pending');
    final delivery = ValueNotifier<String>(rental?['delivery_method'] as String? ?? 'customer_pickup');
    final address = TextEditingController(text: rental?['delivery_address'] as String? ?? '');
    final totalController = TextEditingController(text: rental?['total_amount']?.toString() ?? '');
    final selectedResponsibleIds = <String>{
      ...((rental?['rental_responsibles'] as List? ?? []).whereType<Map>()
        .map((row) => row['user_id']).whereType<String>()),
    };
    if (rental == null) {
      final currentUserId = Supabase.instance.client.auth.currentUser?.id;
      if (currentUserId != null && data.employees.any((e) => e['user_id'] == currentUserId)) {
        selectedResponsibleIds.add(currentUserId);
      }
    }
    final itemRows = <_RentalItemDraft>[];
    for (final item in (rental?['rental_items'] as List? ?? [])) {
      final map = Map<String, dynamic>.from(item as Map);
      itemRows.add(_RentalItemDraft(
        productId: map['product_id'] as String,
        quantity: map['quantity'] as int,
        price: (map['unit_price'] as num).toDouble(),
      ));
    }
    if (itemRows.isEmpty) itemRows.add(_RentalItemDraft());

    final client = Supabase.instance.client;
    Map<String, dynamic>? globalReminder;
    Map<String, dynamic>? rentalReminder;
    var reminderSettingsLoaded = false;
    try {
      globalReminder = await client.from('company_event_reminder_settings')
          .select('enabled, days_before, notifications_per_day')
          .eq('company_id', widget.companyId).maybeSingle();
      if (rental != null) {
        rentalReminder = await client.from('rental_event_reminder_settings')
            .select('enabled, days_before, notifications_per_day')
            .eq('company_id', widget.companyId)
            .eq('rental_id', rental['id']).maybeSingle();
      }
      reminderSettingsLoaded = true;
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Não foi possível carregar os lembretes: $error')),
        );
      }
    }
    final reminderMode = ValueNotifier<String>(
      rentalReminder == null ? 'global' : ((rentalReminder['enabled'] as bool? ?? false) ? 'custom' : 'off'),
    );
    final reminderDays = ValueNotifier<int>(
      rentalReminder?['days_before'] as int? ?? globalReminder?['days_before'] as int? ?? 3,
    );
    final reminderFrequency = ValueNotifier<int>(
      rentalReminder?['notifications_per_day'] as int? ?? globalReminder?['notifications_per_day'] as int? ?? 1,
    );
    final formKey = GlobalKey<FormState>();

    if (!mounted) {
      customerId.dispose();
      start.dispose();
      end.dispose();
      startTime.dispose();
      endTime.dispose();
      status.dispose();
      delivery.dispose();
      reminderMode.dispose();
      reminderDays.dispose();
      reminderFrequency.dispose();
      address.dispose();
      totalController.dispose();
      return;
    }

    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(builder: (context, setDialogState) {
        final days = end.value.difference(start.value).inDays + 1;
        var selectedCustomerName = '';
        for (final customer in data.customers) {
          if (customer['id'] == customerId.value) {
            selectedCustomerName = customer['name'] as String? ?? '';
            break;
          }
        }
        return AlertDialog(
          title: Text(rental == null ? 'Nova locação' : 'Editar locação'),
          content: SizedBox(width: 560, child: Form(
            key: formKey,
            child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Autocomplete<Map<String, dynamic>>(
                initialValue: TextEditingValue(text: selectedCustomerName),
                displayStringForOption: (customer) => customer['name'] as String? ?? 'Cliente',
                optionsBuilder: (text) {
                  final query = text.text.trim().toLowerCase();
                  return data.customers.where((customer) {
                    final name = (customer['name'] as String? ?? '').toLowerCase();
                    return query.isEmpty || name.contains(query);
                  }).toList();
                },
                onSelected: (customer) => setDialogState(() {
                  customerId.value = customer['id'] as String;
                }),
                fieldViewBuilder: (context, controller, focusNode, onFieldSubmitted) =>
                  TextFormField(
                    controller: controller,
                    focusNode: focusNode,
                    decoration: const InputDecoration(
                      labelText: 'Cliente *',
                      hintText: 'Digite para pesquisar pelo nome',
                      prefixIcon: Icon(Icons.search),
                    ),
                    onChanged: (_) => setDialogState(() => customerId.value = null),
                    validator: (_) => customerId.value == null ? 'Selecione um cliente da lista.' : null,
                  ),
              ),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: _dateField(context, 'Início', start, setDialogState)),
                const SizedBox(width: 8),
                Expanded(child: _dateField(context, 'Término', end, setDialogState)),
              ]),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: _timeField(context, 'Horário de início', startTime, setDialogState)),
                const SizedBox(width: 8),
                Expanded(child: _timeField(context, 'Horário de término', endTime, setDialogState)),
              ]),
              DropdownButtonFormField<String>(
                initialValue: status.value,
                decoration: const InputDecoration(labelText: 'Status'),
                items: [
                  DropdownMenuItem(value: 'pending', child: Text('Pendente')),
                  DropdownMenuItem(value: 'confirmed', child: Text('Confirmada')),
                  DropdownMenuItem(value: 'ongoing', child: Text('Em andamento')),
                  if (rental != null) const DropdownMenuItem(value: 'completed', child: Text('Concluída')),
                  if (rental != null) const DropdownMenuItem(value: 'cancelled', child: Text('Cancelada')),
                ],
                onChanged: (v) => setDialogState(() => status.value = v ?? status.value),
              ),
              DropdownButtonFormField<String>(
                initialValue: delivery.value,
                decoration: const InputDecoration(labelText: 'Entrega'),
                items: const [
                  DropdownMenuItem(value: 'customer_pickup', child: Text('Retirada pelo cliente')),
                  DropdownMenuItem(value: 'delivery', child: Text('Entregar no endereço')),
                ],
                onChanged: (v) => setDialogState(() => delivery.value = v ?? delivery.value),
              ),
              if (delivery.value == 'delivery')
                TextFormField(controller: address, decoration: const InputDecoration(labelText: 'Endereço de entrega *'), validator: (v) => delivery.value == 'delivery' && (v == null || v.trim().isEmpty) ? 'Informe o endereço.' : null),
              const SizedBox(height: 14),
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Text('Brinquedos da locação', style: Theme.of(context).textTheme.titleMedium),
                TextButton.icon(onPressed: () => setDialogState(() => itemRows.add(_RentalItemDraft())), icon: const Icon(Icons.add), label: const Text('Adicionar')),
              ]),
              ...List.generate(itemRows.length, (index) {
                final item = itemRows[index];
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  key: ValueKey(item),
                  child: Padding(padding: const EdgeInsets.all(10), child: Column(children: [
                    Row(children: [
                      Expanded(child: DropdownButtonFormField<String>(
                        initialValue: item.productId,
                        decoration: InputDecoration(labelText: 'Brinquedo ${index + 1}'),
                        items: data.products.map((p) => DropdownMenuItem<String>(value: p['id'] as String, child: Text(p['name'] as String? ?? 'Brinquedo', overflow: TextOverflow.ellipsis))).toList(),
                        onChanged: (v) => setDialogState(() {
                          item.productId = v;
                          Map<String, dynamic>? selected;
                          for (final product in data.products) {
                            if (product['id'] == v) { selected = product; break; }
                          }
                          if (selected != null) item.price = (selected['daily_price'] as num).toDouble();
                        }),
                        validator: (v) => v == null ? 'Selecione.' : null,
                      )),
                      IconButton(tooltip: 'Remover brinquedo', onPressed: itemRows.length <= 1 ? null : () => setDialogState(() => itemRows.removeAt(index)), icon: const Icon(Icons.delete_outline)),
                    ]),
                    Row(children: [
                      Expanded(child: TextFormField(
                        initialValue: item.quantity.toString(),
                        decoration: const InputDecoration(labelText: 'Quantidade'),
                        keyboardType: TextInputType.number,
                        validator: (v) => (int.tryParse(v ?? '') ?? 0) < 1 ? 'Mínimo 1.' : null,
                        onChanged: (v) => item.quantity = int.tryParse(v) ?? 0,
                      )),
                      const SizedBox(width: 12),
                      Expanded(child: TextFormField(
                        initialValue: item.price.toStringAsFixed(2),
                        decoration: const InputDecoration(labelText: 'Diária por unidade (R\$)'),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        validator: (v) => (double.tryParse((v ?? '').replaceAll(',', '.')) ?? -1) < 0 ? 'Preço inválido.' : null,
                        onChanged: (v) => item.price = double.tryParse(v.replaceAll(',', '.')) ?? -1,
                      )),
                    ]),
                  ])),
                );
              }),
              const SizedBox(height: 8),
              TextFormField(
                controller: totalController,
                decoration: const InputDecoration(labelText: 'Valor total da locação (R\$) *'),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                validator: (v) => (double.tryParse((v ?? '').replaceAll(',', '.')) ?? -1) < 0 ? 'Informe um valor válido.' : null,
              ),
              const SizedBox(height: 12),
              Align(alignment: Alignment.centerLeft, child: Text('Funcionários responsáveis', style: Theme.of(context).textTheme.titleMedium)),
              ...data.employees.map((employee) {
                final id = employee['user_id'] as String;
                return CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: selectedResponsibleIds.contains(id),
                  title: Text(employee['name'] as String? ?? 'Funcionário'),
                  subtitle: Text(employee['role'] as String? ?? 'Funcionário'),
                  onChanged: (checked) => setDialogState(() {
                    if (checked == true) { selectedResponsibleIds.add(id); } else { selectedResponsibleIds.remove(id); }
                  }),
                );
              }),
              const SizedBox(height: 14),
              Text('Lembretes deste evento', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                key: ValueKey(reminderMode.value),
                initialValue: reminderMode.value,
                decoration: const InputDecoration(labelText: 'Como deseja receber os avisos?'),
                items: const [
                  DropdownMenuItem(value: 'global', child: Text('Usar configuração geral')),
                  DropdownMenuItem(value: 'custom', child: Text('Personalizar para esta locação')),
                  DropdownMenuItem(value: 'off', child: Text('Não avisar nesta locação')),
                ],
                onChanged: (value) => setDialogState(() => reminderMode.value = value ?? 'global'),
              ),
              if (reminderMode.value == 'custom') ...[
                const SizedBox(height: 8),
                Row(children: [
                  Expanded(child: DropdownButtonFormField<int>(
                    initialValue: reminderDays.value,
                    decoration: const InputDecoration(labelText: 'Dias antes'),
                    items: List.generate(30, (index) => index + 1)
                        .map((value) => DropdownMenuItem(value: value, child: Text('$value dia(s)')))
                        .toList(),
                    onChanged: (value) => setDialogState(() => reminderDays.value = value ?? 3),
                  )),
                  const SizedBox(width: 10),
                  Expanded(child: DropdownButtonFormField<int>(
                    initialValue: reminderFrequency.value,
                    decoration: const InputDecoration(labelText: 'Avisos por dia'),
                    items: List.generate(4, (index) => index + 1)
                        .map((value) => DropdownMenuItem(value: value, child: Text('$value aviso(s)')))
                        .toList(),
                    onChanged: (value) => setDialogState(() => reminderFrequency.value = value ?? 1),
                  )),
                ]),
              ],
              const SizedBox(height: 6),
              const Text('Os lembretes seguem o horário de Brasília. Os avisos gerais são usados quando esta locação não tem uma configuração própria.', style: TextStyle(fontSize: 12)),
              const SizedBox(height: 12),
              Text('Período: ${days > 0 ? days : 0} dia(s). O valor total pode ser ajustado manualmente.', style: const TextStyle(fontSize: 12)),
            ])),
          )),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () {
              if (!isValidRentalTimeRange(
                startDate: start.value,
                endDate: end.value,
                startTime: startTime.value,
                endTime: endTime.value,
              )) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('O término precisa ser posterior ao início.')),
                );
                return;
              }
              if (formKey.currentState!.validate() && itemRows.every((i) => i.productId != null && i.quantity > 0 && i.price >= 0)) {
                final ids = itemRows.map((i) => i.productId).toList();
                if (ids.toSet().length != ids.length) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Não selecione o mesmo brinquedo mais de uma vez.')));
                  return;
                }
                Navigator.pop(dialogContext, true);
              }
            }, child: const Text('Salvar locação')),
          ],
        );
      }),
    );

    if (saved == true && mounted) {
      try {
        final total = double.tryParse(totalController.text.replaceAll(',', '.')) ?? 0;
        final items = itemRows.map((item) => {
          'product_id': item.productId, 'quantity': item.quantity, 'unit_price': item.price,
        }).toList();
        final responsibleIds = selectedResponsibleIds.toList();
        String rentalId;
        if (rental == null) {
          rentalId = await repo.createRentalWithItems(
            customerId: customerId.value!, startDate: _iso(start.value), endDate: _iso(end.value),
            startTime: startTime.value, endTime: endTime.value,
            status: status.value, deliveryMethod: delivery.value, totalAmount: total,
            items: items, deliveryAddress: address.text, responsibleUserIds: responsibleIds,
          );
        } else {
          rentalId = rental['id'] as String;
          await repo.updateRentalWithItems(
            rentalId: rentalId, customerId: customerId.value!,
            startDate: _iso(start.value), endDate: _iso(end.value),
            startTime: startTime.value, endTime: endTime.value,
            status: status.value, deliveryMethod: delivery.value, totalAmount: total,
            items: items, deliveryAddress: address.text, responsibleUserIds: responsibleIds,
          );
        }
        if (reminderSettingsLoaded) {
          try {
            if (reminderMode.value == 'global') {
            await Supabase.instance.client.from('rental_event_reminder_settings')
                .delete().eq('company_id', widget.companyId).eq('rental_id', rentalId);
            } else {
              await Supabase.instance.client.from('rental_event_reminder_settings').upsert({
              'company_id': widget.companyId,
              'rental_id': rentalId,
              'enabled': reminderMode.value == 'custom',
              'days_before': reminderMode.value == 'custom' ? reminderDays.value : 3,
              'notifications_per_day': reminderMode.value == 'custom' ? reminderFrequency.value : 1,
              'updated_by': Supabase.instance.client.auth.currentUser?.id,
              'updated_at': DateTime.now().toUtc().toIso8601String(),
              }, onConflict: 'rental_id');
            }
          } catch (reminderError) {
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Locação salva, mas não foi possível salvar o lembrete: $reminderError')),
              );
            }
          }
        }
        await reload();
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Locação salva com sucesso.')));
      } catch (error) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Não foi possível salvar: $error')));
      }
    }
    customerId.dispose(); start.dispose(); end.dispose(); startTime.dispose(); endTime.dispose(); status.dispose(); delivery.dispose(); reminderMode.dispose(); reminderDays.dispose(); reminderFrequency.dispose(); address.dispose(); totalController.dispose();
  }


  Future<void> _deleteRental(Map<String, dynamic> rental) async {
    try {
      final existingContract = await Supabase.instance.client.from('rental_contracts')
          .select('id,status').eq('rental_id', rental['id']).inFilter('status', ['sent', 'viewed', 'signed']).limit(1).maybeSingle();
      if (existingContract != null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Esta locação possui um contrato enviado ou assinado. A exclusão foi bloqueada para preservar o histórico e os documentos.')),
          );
        }
        return;
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Não foi possível verificar contratos vinculados: $error')),
        );
      }
      return;
    }
    if (!mounted) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Excluir locação?'),
        content: const Text('Os brinquedos e eventos vinculados serão removidos. Se houver contrato enviado ou assinado, a exclusão será bloqueada para preservar o histórico e os documentos. Lançamentos financeiros e pagamentos relacionados serão preservados quando houver vínculo configurado. Esta ação não poderá ser desfeita.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
          FilledButton.tonal(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Excluir')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await repo.deleteRental(rental['id'] as String);
      await reload();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Locação excluída.')));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Não foi possível excluir: $error')));
    }
  }

  Widget _dateField(BuildContext context, String label, ValueNotifier<DateTime> value, void Function(void Function()) refresh) {
    return ValueListenableBuilder<DateTime>(
      valueListenable: value,
      builder: (context, date, _) => OutlinedButton(
        onPressed: () async {
          final picked = await showDatePicker(context: context, initialDate: date, firstDate: DateTime(2020), lastDate: DateTime(2100));
          if (picked != null) refresh(() => value.value = picked);
        },
        child: Text('$label\n${dateFormat.format(date)}', textAlign: TextAlign.center),
      ),
    );
  }

  Widget _timeField(
    BuildContext context,
    String label,
    ValueNotifier<String> value,
    void Function(void Function()) refresh,
  ) {
    return ValueListenableBuilder<String>(
      valueListenable: value,
      builder: (context, time, _) => OutlinedButton(
        onPressed: () async {
          final parts = time.split(':');
          final initial = TimeOfDay(
            hour: int.tryParse(parts.first) ?? 9,
            minute: int.tryParse(parts.length > 1 ? parts[1] : '') ?? 0,
          );
          final picked = await showTimePicker(context: context, initialTime: initial);
          if (picked != null) {
            final formatted = '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
            refresh(() => value.value = formatted);
          }
        },
        child: Text('$label\n$time', textAlign: TextAlign.center),
      ),
    );
  }

  DateTime? _date(dynamic value) => value == null ? null : DateTime.tryParse(value.toString());
  String _iso(DateTime value) => DateFormat('yyyy-MM-dd').format(value);

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Locações'), actions: [
      IconButton(tooltip: 'Atualizar', onPressed: reload, icon: const Icon(Icons.refresh)),
    ]),
    floatingActionButton: FloatingActionButton.extended(onPressed: () => future.then((data) => editRental(data)), icon: const Icon(Icons.add), label: const Text('Nova locação')),
    body: FutureBuilder<_RentalData>(
      future: future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
        if (snapshot.hasError) return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text('Não foi possível carregar as locações. ${snapshot.error}', textAlign: TextAlign.center)));
        final data = snapshot.data!;
        final rows = data.rentals.where((r) => ((r['customers']?['name'] ?? '') as String).toLowerCase().contains(search)).toList();
        if (rows.isEmpty) return Center(child: Text('Nenhuma locação encontrada.'));
        return Column(children: [
          Padding(padding: const EdgeInsets.all(16), child: TextField(decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Buscar por cliente', border: OutlineInputBorder()), onChanged: (v) => setState(() => search = v.trim().toLowerCase()))),
          Expanded(child: RefreshIndicator(onRefresh: reload, child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 100), itemCount: rows.length,
            separatorBuilder: (_, i) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final r = rows[index];
              final currentUserId = Supabase.instance.client.auth.currentUser?.id;
              final currentMember = data.employees.where((e) => e['user_id'] == currentUserId);
              final canEdit = currentMember.isNotEmpty && ['owner', 'admin'].contains(currentMember.first['role']);
              final items = (r['rental_items'] as List? ?? []).whereType<Map>().toList();
              final names = items.map((i) => i['products']?['name'] ?? 'Brinquedo').join(', ');
              return Card(child: ListTile(
                leading: const CircleAvatar(child: Icon(Icons.event_note_outlined)),
                title: Text(r['customers']?['name'] as String? ?? 'Cliente'),
                subtitle: Text('${dateFormat.format(_date(r['start_date']) ?? DateTime.now())} ${normalizeRentalTime(r['start_time'], '00:00')} a ${dateFormat.format(_date(r['end_date']) ?? DateTime.now())} ${normalizeRentalTime(r['end_time'], '23:59')}\n$names\nStatus: ${r['status']} · R\$ ${r['total_amount']}'),
                isThreeLine: true,
                trailing: canEdit ? Row(mainAxisSize: MainAxisSize.min, children: [
                  IconButton(tooltip: 'Editar locação', onPressed: () => editRental(data, r), icon: const Icon(Icons.edit_outlined)),
                  IconButton(tooltip: 'Excluir locação', onPressed: () => _deleteRental(r), icon: const Icon(Icons.delete_outline)),
                ]) : const Icon(Icons.lock_outline),
                onTap: canEdit ? () => editRental(data, r) : null,
              ));
            },
          ))),
        ]);
      },
    ),
  );
}

class _RentalData {
  _RentalData({required this.rentals, required this.customers, required this.products, required this.employees});
  final List<Map<String, dynamic>> rentals;
  final List<Map<String, dynamic>> customers;
  final List<Map<String, dynamic>> products;
  final List<Map<String, dynamic>> employees;
}

class _RentalItemDraft {
  _RentalItemDraft({this.productId, this.quantity = 1, this.price = 0});
  String? productId;
  int quantity;
  double price;
}
