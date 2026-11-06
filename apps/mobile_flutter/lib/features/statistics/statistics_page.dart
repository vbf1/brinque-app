import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../data/company_data_repository.dart';

class StatisticsPage extends StatefulWidget {
  const StatisticsPage({super.key, required this.companyId});
  final String companyId;

  @override
  State<StatisticsPage> createState() => _StatisticsPageState();
}

class _StatisticsPageState extends State<StatisticsPage> {
  late final CompanyDataRepository _repository = CompanyDataRepository(
    client: Supabase.instance.client,
    companyId: widget.companyId,
  );
  late Future<List<Map<String, dynamic>>> _future = _repository.fetchRentals();

  Future<void> _reload() async {
    final next = _repository.fetchRentals();
    setState(() => _future = next);
    await next;
  }

  String _money(num value) => 'R\$ ${value.toStringAsFixed(2).replaceAll('.', ',')}';

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Estatísticas'), actions: [
      IconButton(tooltip: 'Atualizar', onPressed: _reload, icon: const Icon(Icons.refresh)),
    ]),
    body: FutureBuilder<List<Map<String, dynamic>>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) { return const Center(child: CircularProgressIndicator()); }
        if (snapshot.hasError) { return Center(child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('Não foi possível carregar as estatísticas. ${snapshot.error}', textAlign: TextAlign.center),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _reload, child: const Text('Tentar novamente')),
          ]),
        )); }
        final rentals = snapshot.data ?? [];
        final active = rentals.where((r) => ['pending', 'confirmed', 'ongoing'].contains(r['status'])).length;
        final completed = rentals.where((r) => r['status'] == 'completed').length;
        final cancelled = rentals.where((r) => r['status'] == 'cancelled').length;
        final revenue = rentals.where((r) => r['status'] != 'cancelled')
            .fold<num>(0, (sum, r) => sum + ((r['total_amount'] as num?) ?? 0));

        final products = <String, _NamedCount>{};
        final customers = <String, _NamedCount>{};
        final monthly = <String, num>{};
        for (final rental in rentals.where((r) => r['status'] != 'cancelled')) {
          final customer = (rental['customers'] as Map?)?['name']?.toString() ?? 'Cliente';
          final customerKey = rental['customer_id']?.toString() ?? 'rental:${rental['id']}';
          final previousCustomer = customers[customerKey];
          customers[customerKey] = _NamedCount(
            name: customer,
            count: (previousCustomer?.count ?? 0) + 1,
          );
          final start = DateTime.tryParse(rental['start_date']?.toString() ?? '');
          if (start != null) {
            final key = '${start.year}-${start.month.toString().padLeft(2, '0')}';
            monthly[key] = (monthly[key] ?? 0) + ((rental['total_amount'] as num?) ?? 0);
          }
          for (final rawItem in (rental['rental_items'] as List? ?? [])) {
            if (rawItem is! Map) continue;
            final item = Map<String, dynamic>.from(rawItem);
            final name = (item['products'] as Map?)?['name']?.toString() ?? 'Brinquedo';
            final productKey = item['product_id']?.toString() ?? 'item:${item['id']}';
            final previousProduct = products[productKey];
            products[productKey] = _NamedCount(
              name: name,
              count: (previousProduct?.count ?? 0) + ((item['quantity'] as num?)?.toInt() ?? 0),
            );
          }
        }
        final topProducts = products.values.toList()..sort((a, b) => b.count.compareTo(a.count));
        final topCustomers = customers.values.toList()..sort((a, b) => b.count.compareTo(a.count));
        final monthlyRows = monthly.entries.toList()..sort((a, b) => a.key.compareTo(b.key));
        final maxMonthly = monthlyRows.fold<num>(0, (max, row) => row.value > max ? row.value : max);

        return RefreshIndicator(
          onRefresh: _reload,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
            children: [
              Wrap(spacing: 10, runSpacing: 10, children: [
                _metric('Total de locações', rentals.length.toString()),
                _metric('Em andamento', active.toString()),
                _metric('Concluídas', completed.toString()),
                _metric('Canceladas', cancelled.toString()),
                _metric('Valor das locações', _money(revenue)),
              ]),
              const SizedBox(height: 18),
              _section('Brinquedos mais alugados'),
              if (topProducts.isEmpty)
                const _EmptyLine(text: 'Ainda não há itens suficientes para esta estatística.')
              else
                ...topProducts.take(5).toList().asMap().entries.map((entry) => _rankingRow(
                  entry.key + 1, entry.value.name, '${entry.value.count} unidade(s)',
                )),
              const SizedBox(height: 18),
              _section('Clientes recorrentes'),
              if (topCustomers.isEmpty)
                const _EmptyLine(text: 'Ainda não há clientes recorrentes.')
              else
                ...topCustomers.take(5).toList().asMap().entries.map((entry) => _rankingRow(
                  entry.key + 1, entry.value.name, '${entry.value.count} locação(ões)',
                )),
              const SizedBox(height: 18),
              _section('Valores por mês'),
              if (monthlyRows.isEmpty)
                const _EmptyLine(text: 'Ainda não há valores para exibir.')
              else
                ...monthlyRows.map((row) => _monthlyRow(row.key, row.value, maxMonthly)),
              const SizedBox(height: 8),
              const Text('Os valores representam o total das locações não canceladas, não necessariamente pagamentos já recebidos.', style: TextStyle(fontSize: 11, color: Colors.grey)),
            ],
          ),
        );
      },
    ),
  );

  Widget _metric(String label, String value) => SizedBox(
    width: 150,
    child: Card(child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: Theme.of(context).textTheme.labelMedium),
        const SizedBox(height: 6),
        Text(value, style: Theme.of(context).textTheme.titleLarge),
      ]),
    )),
  );

  Widget _section(String title) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(title, style: Theme.of(context).textTheme.titleMedium),
  );

  Widget _rankingRow(int rank, String title, String detail) => Card(
    child: ListTile(
      dense: true,
      leading: CircleAvatar(radius: 16, child: Text('$rank', style: const TextStyle(fontSize: 12))),
      title: Text(title, maxLines: 2, overflow: TextOverflow.ellipsis),
      subtitle: Text(detail, maxLines: 2, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall),
    ),
  );

  Widget _monthlyRow(String key, num value, num max) {
    final parts = key.split('-');
    final label = parts.length == 2 ? '${parts[1]}/${parts[0].substring(2)}' : key;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(children: [
        SizedBox(width: 46, child: Text(label, style: Theme.of(context).textTheme.bodySmall)),
        Expanded(child: LinearProgressIndicator(value: max <= 0 ? 0 : (value / max).toDouble(), minHeight: 9)),
        const SizedBox(width: 8),
        Flexible(flex: 3, child: FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerRight,
          child: Text(_money(value), textAlign: TextAlign.end, style: Theme.of(context).textTheme.bodySmall),
        )),
      ]),
    );
  }
}

class _NamedCount {
  const _NamedCount({required this.name, required this.count});
  final String name;
  final int count;
}

class _EmptyLine extends StatelessWidget {
  const _EmptyLine({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 16),
    child: Text(text, style: Theme.of(context).textTheme.bodySmall),
  );
}
