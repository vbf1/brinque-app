import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../data/company_data_repository.dart';

class ProductsPage extends StatefulWidget {
  const ProductsPage({super.key, required this.companyId});
  final String companyId;

  @override
  State<ProductsPage> createState() => _ProductsPageState();
}

class _ProductsPageState extends State<ProductsPage> {
  late final CompanyDataRepository _repository = CompanyDataRepository(
    client: Supabase.instance.client,
    companyId: widget.companyId,
  );
  late Future<List<Map<String, dynamic>>> _future = _load();
  String _search = '';

  Future<List<Map<String, dynamic>>> _load() async {
    // O histórico é complementar e não deve bloquear a listagem do estoque.
    final results = await Future.wait([
      _repository.fetchProducts(),
      _repository.fetchProductUnits(),
    ]);
    final products = results[0];
    final units = results[1];
    List<Map<String, dynamic>>? rentals;
    try {
      rentals = await _repository.fetchRentals();
    } catch (error) {
      debugPrint('KidsLoc: não foi possível carregar o histórico de locações do estoque: $error');
    }
    final now = DateTime.now();
    const activeStatuses = {'pending', 'confirmed', 'ongoing'};
    final activeRentals = (rentals ?? []).where((rental) {
      if (!activeStatuses.contains(rental['status'])) return false;
      final start = _rentalBoundary(
        rental['start_date'],
        rental['start_time'],
        isEnd: false,
      );
      final end = _rentalBoundary(
        rental['end_date'] ?? rental['start_date'],
        rental['end_time'],
        isEnd: true,
      );
      return start != null && end != null && !now.isBefore(start) && now.isBefore(end);
    }).toList();
    return products.map((product) {
      final productUnits = units.where((unit) => unit['product_id'] == product['id']).toList();
      final individual = product['inventory_mode'] == 'individual';
      int? available;
      if (rentals != null && individual) {
        final reservedIds = activeRentals.expand((rental) =>
          (rental['rental_items'] as List? ?? []).where((item) => item['product_id'] == product['id'])
            .expand((item) => (item['rental_item_units'] as List? ?? [])
              .map((allocation) => allocation['product_unit_id'])),
        ).toSet();
        available = productUnits.where((unit) => unit['status'] == 'available' && !reservedIds.contains(unit['id'])).length;
      } else if (rentals != null) {
        final reservedQuantity = activeRentals.fold<int>(0, (total, rental) => total +
          (rental['rental_items'] as List? ?? []).where((item) => item['product_id'] == product['id'])
            .fold<int>(0, (sum, item) => sum + ((item['quantity'] as num?)?.toInt() ?? 0)),
        );
        available = ((product['total_quantity'] as num?)?.toInt() ?? 0) - reservedQuantity;
        if (available < 0) available = 0;
      }
      return {
        ...product,
        '_units': productUnits,
        '_rentals': rentals,
        'available': available,
      };
    }).toList();
  }

  DateTime? _rentalBoundary(dynamic rawDate, dynamic rawTime, {required bool isEnd}) {
    final date = DateTime.tryParse(rawDate?.toString() ?? '');
    if (date == null) return null;
    final time = rawTime?.toString();
    if (time == null || time.isEmpty) {
      return isEnd
          ? DateTime(date.year, date.month, date.day).add(const Duration(days: 1))
          : DateTime(date.year, date.month, date.day);
    }
    final parts = time.split(':');
    final hour = int.tryParse(parts.first);
    final minute = int.tryParse(parts.length > 1 ? parts[1] : '');
    if (hour == null || minute == null || hour < 0 || hour > 24 ||
        minute < 0 || minute > 59 || (hour == 24 && minute != 0)) {
      return null;
    }
    final boundary = DateTime(date.year, date.month, date.day);
    return hour == 24
        ? boundary.add(const Duration(days: 1))
        : boundary.add(Duration(hours: hour, minutes: minute));
  }

  Future<void> _reload() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  Future<void> _setUnitStatus(Map<String, dynamic> unit) async {
    final id = unit['id'] as String;
    final next = unit['status'] == 'maintenance' ? 'available' : 'maintenance';
    try {
      await _repository.setProductUnitStatus(id, next);
      await _reload();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(next == 'maintenance' ? 'Unidade enviada para manutenção.' : 'Unidade liberada para locação.'),
        ));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Não foi possível atualizar a unidade: $error')));
      }
    }
  }
  Future<void> _edit([Map<String, dynamic>? product]) async {
    final name = TextEditingController(text: product?['name'] as String? ?? '');
    final quantity = TextEditingController(text: (product?['total_quantity'] ?? 1).toString());
    final price = TextEditingController(text: (product?['daily_price'] ?? 0).toString());
    var mode = product?['inventory_mode'] as String? ?? 'quantity';
    final formKey = GlobalKey<FormState>();
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(builder: (context, setDialogState) =>
        AlertDialog(
          title: Text(product == null ? 'Cadastrar brinquedo' : 'Editar brinquedo'),
          content: SizedBox(width: 420, child: Form(
            key: formKey,
            child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextFormField(controller: name, decoration: const InputDecoration(labelText: 'Nome do brinquedo *'), validator: (v) => v == null || v.trim().isEmpty ? 'Informe o nome.' : null),
              DropdownButtonFormField<String>(
                initialValue: mode,
                decoration: const InputDecoration(labelText: 'Tipo de controle'),
                items: const [
                  DropdownMenuItem(value: 'quantity', child: Text('Por quantidade')),
                  DropdownMenuItem(value: 'individual', child: Text('Unidades individuais')),
                ],
                onChanged: product == null ? (v) => setDialogState(() => mode = v ?? mode) : null,
              ),
              TextFormField(controller: quantity, decoration: const InputDecoration(labelText: 'Quantidade total'), keyboardType: TextInputType.number, validator: (v) => (int.tryParse(v ?? '') ?? 0) < 1 ? 'Informe ao menos 1 unidade.' : null),
              TextFormField(controller: price, decoration: const InputDecoration(labelText: 'Preço da diária (R\$)'), keyboardType: const TextInputType.numberWithOptions(decimal: true), validator: (v) => (double.tryParse((v ?? '').replaceAll(',', '.')) ?? -1) < 0 ? 'Preço inválido.' : null),
              if (product != null) const Padding(
                padding: EdgeInsets.only(top: 10),
                child: Text('O tipo de controle não pode ser alterado após o cadastro.', style: TextStyle(fontSize: 12)),
              ),
            ])),
          )),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () { if (formKey.currentState!.validate()) Navigator.pop(dialogContext, true); }, child: const Text('Salvar')),
          ],
        ),
      ),
    );
    if (saved == true && mounted) {
      try {
        await _repository.saveProduct(
          productId: product?['id'] as String?,
          name: name.text,
          inventoryMode: mode,
          quantity: int.parse(quantity.text),
          dailyPrice: double.parse(price.text.replaceAll(',', '.')),
        );
        await _reload();
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Brinquedo salvo e lista atualizada.')));
      } catch (error) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Não foi possível salvar: $error')));
      }
    }
    name.dispose(); quantity.dispose(); price.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Brinquedos e estoque'), actions: [
      IconButton(tooltip: 'Atualizar', onPressed: _reload, icon: const Icon(Icons.refresh)),
    ]),
    floatingActionButton: FloatingActionButton.extended(onPressed: () => _edit(), icon: const Icon(Icons.add), label: const Text('Novo brinquedo')),
    body: Column(children: [
      Padding(
        padding: const EdgeInsets.all(16),
        child: TextField(
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Buscar brinquedo', border: OutlineInputBorder()),
          onChanged: (value) => setState(() => _search = value.trim().toLowerCase()),
        ),
      ),
      Expanded(child: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snapshot.hasError) return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text('Não foi possível carregar o estoque. ${snapshot.error}', textAlign: TextAlign.center)));
          final rows = (snapshot.data ?? []).where((p) => (p['name'] as String? ?? '').toLowerCase().contains(_search)).toList();
          if (rows.isEmpty) return Center(child: Text(_search.isEmpty ? 'Nenhum brinquedo cadastrado.' : 'Nenhum brinquedo encontrado.'));
          return RefreshIndicator(onRefresh: _reload, child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
            itemCount: rows.length,
            separatorBuilder: (_, i) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final p = rows[index];
              final individual = p['inventory_mode'] == 'individual';
              final units = List<Map<String, dynamic>>.from(p['_units'] as List? ?? []);
              final rentalsKnown = p['_rentals'] != null;
              final rentals = List<Map<String, dynamic>>.from(p['_rentals'] as List? ?? []);
              return Card(child: Column(children: [
                ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.toys_outlined)),
                  title: Text(p['name'] as String? ?? 'Brinquedo'),
                  subtitle: Text('${p['available'] == null ? 'Disponibilidade indisponível' : '${p['available']} disponível(is)'} de ${p['total_quantity']} · R\$ ${p['daily_price']}/dia · ${individual ? 'Unidades individuais' : 'Por quantidade'}'),
                  trailing: IconButton(tooltip: 'Editar brinquedo', onPressed: () => _edit(p), icon: const Icon(Icons.edit_outlined)),
                  onTap: () => _edit(p),
                ),
                if (individual && units.isNotEmpty) ExpansionTile(
                  title: const Text('Unidades e histórico de locações'),
                  children: units.map((unit) {
                    final history = rentals.where((r) => (r['rental_items'] as List? ?? []).any((item) =>
                      (item['rental_item_units'] as List? ?? []).any((allocation) => allocation['product_unit_id'] == unit['id'])))
                      .toList()..sort((a, b) => (b['start_date'] ?? '').toString().compareTo((a['start_date'] ?? '').toString()));
                    final recent = history.take(3).map((r) => '${(r['customers'] as Map?)?['name'] ?? 'Cliente'} · ${r['start_date']} · ${r['status']}').join(' | ');
                    final status = unit['status'] as String? ?? 'available';
                    final now = DateTime.now();
                    final today = '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
                    final reservedToday = rentalsKnown && rentals.any((rental) {
                      final start = rental['start_date']?.toString() ?? '';
                      final end = rental['end_date']?.toString() ?? start;
                      final active = ['pending', 'confirmed', 'ongoing'].contains(rental['status']) && start.compareTo(today) <= 0 && end.compareTo(today) >= 0;
                      return active && (rental['rental_items'] as List? ?? []).any((item) =>
                        (item['rental_item_units'] as List? ?? []).any((allocation) => allocation['product_unit_id'] == unit['id']));
                    });
                    final label = status == 'maintenance' ? 'Em manutenção' : status == 'inactive' ? 'Inativa' : !rentalsKnown ? 'Histórico indisponível' : reservedToday ? 'Reservada hoje' : 'Disponível';
                    return ListTile(
                      title: Text('Unidade ${unit['asset_code'] ?? '—'}'),
                      subtitle: Text('$label\nHistórico: ${!rentalsKnown ? 'Indisponível' : recent.isEmpty ? 'Sem locações registradas' : recent}'),
                      isThreeLine: true,
                      trailing: status == 'inactive' ? null : TextButton(
                        onPressed: () => _setUnitStatus(unit),
                        child: Text(status == 'maintenance' ? 'Liberar' : 'Manutenção'),
                      ),
                    );
                  }).toList(),
                ),
              ]));
            },
          ));
        },
      )),
    ]),
  );
}
