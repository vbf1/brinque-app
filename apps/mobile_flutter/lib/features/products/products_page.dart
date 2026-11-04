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
    final products = await _repository.fetchProducts();
    final units = await _repository.fetchProductUnits();
    return products.map((product) {
      final productUnits = units.where((unit) => unit['product_id'] == product['id']).toList();
      final individual = product['inventory_mode'] == 'individual';
      return {
        ...product,
        'available': individual
            ? productUnits.where((unit) => unit['status'] == 'available').length
            : product['total_quantity'],
      };
    }).toList();
  }

  Future<void> _reload() async {
    setState(() => _future = _load());
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
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Brinquedo salvo com sucesso.')));
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
              return Card(child: ListTile(
                leading: const CircleAvatar(child: Icon(Icons.toys_outlined)),
                title: Text(p['name'] as String? ?? 'Brinquedo'),
                subtitle: Text('${p['available']} disponível(is) de ${p['total_quantity']} · R\$ ${p['daily_price']}/dia · ${individual ? 'Unidades individuais' : 'Por quantidade'}'),
                trailing: IconButton(tooltip: 'Editar brinquedo', onPressed: () => _edit(p), icon: const Icon(Icons.edit_outlined)),
                onTap: () => _edit(p),
              ));
            },
          ));
        },
      )),
    ]),
  );
}
