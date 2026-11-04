import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../data/company_data_repository.dart';

class FinancePage extends StatefulWidget {
  const FinancePage({super.key, required this.companyId});
  final String companyId;
  @override
  State<FinancePage> createState() => _FinancePageState();
}
class _FinancePageState extends State<FinancePage> {
  late final CompanyDataRepository _repository = CompanyDataRepository(client: Supabase.instance.client, companyId: widget.companyId);
  late Future<List<Map<String, dynamic>>> _future = _repository.fetchTransactions();
  String _search = '';
  bool _busy = false;
  Future<void> _reload() async { final next = _repository.fetchTransactions(); setState(() => _future = next); await next; }
  String _money(num value) => value.toStringAsFixed(2).replaceAll('.', ',');
  Future<void> _edit([Map<String, dynamic>? row]) async {
    final description = TextEditingController(text: row?['description'] as String? ?? '');
    final amount = TextEditingController(text: row == null ? '' : (row['amount'] as num).toString());
    var type = row?['transaction_type'] as String? ?? 'income';
    final key = GlobalKey<FormState>();
    final saved = await showDialog<bool>(context: context, builder: (dialogContext) => StatefulBuilder(builder: (context, setDialogState) => AlertDialog(
      title: Text(row == null ? 'Novo lançamento' : 'Editar lançamento'),
      content: SizedBox(width: 420, child: Form(key: key, child: Column(mainAxisSize: MainAxisSize.min, children: [
        TextFormField(controller: description, decoration: const InputDecoration(labelText: 'Descrição'), validator: (v) => v == null || v.trim().isEmpty ? 'Informe a descrição.' : null),
        DropdownButtonFormField<String>(initialValue: type, decoration: const InputDecoration(labelText: 'Tipo'), items: const [DropdownMenuItem(value: 'income', child: Text('Entrada')), DropdownMenuItem(value: 'expense', child: Text('Saída'))], onChanged: (v) => setDialogState(() => type = v ?? type)),
        TextFormField(controller: amount, decoration: const InputDecoration(labelText: 'Valor (R\$)'), keyboardType: const TextInputType.numberWithOptions(decimal: true), validator: (v) => (double.tryParse((v ?? '').replaceAll(',', '.')) ?? 0) <= 0 ? 'Informe um valor maior que zero.' : null),
      ]))),
      actions: [TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')), FilledButton(onPressed: () { if (key.currentState!.validate()) Navigator.pop(dialogContext, true); }, child: const Text('Salvar'))],
    )));
    if (saved == true && mounted) {
      setState(() => _busy = true);
      try { await _repository.saveTransaction(id: row?['id'] as String?, type: type, description: description.text, amount: double.parse(amount.text.replaceAll(',', '.'))); await _reload(); }
      catch (error) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Não foi possível salvar: $error'))); }
      finally { if (mounted) setState(() => _busy = false); }
    }
    description.dispose(); amount.dispose();
  }
  Future<void> _delete(Map<String, dynamic> row) async {
    final confirmed = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
      title: const Text('Excluir lançamento?'), content: Text('Deseja excluir "${row['description']}"?'),
      actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')), FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Excluir'))],
    ));
    if (confirmed != true) return;
    setState(() => _busy = true);
    try { await _repository.deleteTransaction(row['id'] as String); await _reload(); }
    catch (error) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Não foi possível excluir: $error'))); }
    finally { if (mounted) setState(() => _busy = false); }
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Financeiro'), actions: [IconButton(tooltip: 'Atualizar', onPressed: _reload, icon: const Icon(Icons.refresh))]),
    floatingActionButton: FloatingActionButton.extended(onPressed: _busy ? null : () => _edit(), icon: const Icon(Icons.add), label: const Text('Lançamento')),
    body: FutureBuilder<List<Map<String, dynamic>>>(future: _future, builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
      if (snapshot.hasError) return Center(child: Text('Não foi possível carregar o financeiro. ${snapshot.error}'));
      final rows = snapshot.data ?? [];
      final income = rows.where((r) => r['transaction_type'] == 'income').fold<num>(0, (sum, r) => sum + (r['amount'] as num));
      final expense = rows.where((r) => r['transaction_type'] == 'expense').fold<num>(0, (sum, r) => sum + (r['amount'] as num));
      final filtered = rows.where((r) => (r['description'] as String? ?? '').toLowerCase().contains(_search)).toList();
      return RefreshIndicator(onRefresh: _reload, child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 100), children: [
        Wrap(spacing: 10, runSpacing: 10, children: [_summary('Entradas', income), _summary('Saídas', expense), _summary('Saldo registrado', income-expense)]),
        const SizedBox(height: 16),
        TextField(decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Pesquisar movimentação...', border: OutlineInputBorder()), onChanged: (v) => setState(() => _search = v.trim().toLowerCase())),
        const SizedBox(height: 12),
        if (filtered.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('Nenhuma movimentação encontrada.'))),
        ...filtered.map((row) => Card(child: ListTile(
          leading: CircleAvatar(child: Icon(row['transaction_type'] == 'income' ? Icons.south_west : Icons.north_east)),
          title: Text(row['description'] as String? ?? 'Lançamento'), subtitle: Text(row['transaction_type'] == 'income' ? 'Entrada' : 'Saída'),
          trailing: SizedBox(width: 124, child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text('R\$ ${_money(row['amount'] as num)}', style: const TextStyle(fontWeight: FontWeight.w600)),
            Row(mainAxisAlignment: MainAxisAlignment.end, children: [
              IconButton(visualDensity: VisualDensity.compact, tooltip: 'Editar', onPressed: _busy ? null : () => _edit(row), icon: const Icon(Icons.edit_outlined, size: 18)),
              IconButton(visualDensity: VisualDensity.compact, tooltip: 'Excluir', onPressed: _busy ? null : () => _delete(row), icon: const Icon(Icons.delete_outline, size: 18)),
            ]),
          ])),
        ))),
      ]));
    }),
  );
  Widget _summary(String label, num value) => SizedBox(width: 155, child: Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text(label, style: Theme.of(context).textTheme.labelMedium), const SizedBox(height: 6), Text('R\$ ${_money(value)}', style: Theme.of(context).textTheme.titleMedium),
  ]))));
}
