import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class QuotesPage extends StatefulWidget {
  const QuotesPage({super.key, required this.companyId});
  final String companyId;

  @override
  State<QuotesPage> createState() => _QuotesPageState();
}

class _QuotesPageState extends State<QuotesPage> {
  final _client = Supabase.instance.client;
  late Future<_QuoteData> _future = _load();
  bool _busy = false;

  Future<_QuoteData> _load() async {
    final results = await Future.wait([
      _client.from('quotes')
          .select('id, quote_number, customer_id, status, issue_date, valid_until, subtotal, discount, total_amount, notes, customers(name, phone), quote_items(id, description, quantity, unit_price, subtotal, products(name), services(name))')
          .eq('company_id', widget.companyId)
          .order('created_at', ascending: false),
      _client.from('customers').select('id, name, phone').eq('company_id', widget.companyId).order('name'),
      _client.from('products').select('id, name, daily_price').eq('company_id', widget.companyId).eq('active', true).order('name'),
      _client.from('services').select('id, name, price, price_unit').eq('company_id', widget.companyId).eq('active', true).order('name'),
    ]);
    return _QuoteData(
      quotes: List<Map<String, dynamic>>.from(results[0]),
      customers: List<Map<String, dynamic>>.from(results[1]),
      products: List<Map<String, dynamic>>.from(results[2]),
      services: List<Map<String, dynamic>>.from(results[3]),
    );
  }

  Future<void> _reload() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  String _money(num value) => 'R\$ ${value.toStringAsFixed(2).replaceAll('.', ',')}';
  String _date(dynamic value) {
    final parsed = DateTime.tryParse(value?.toString() ?? '');
    return parsed == null ? '—' : DateFormat('dd/MM/yyyy').format(parsed);
  }

  Future<void> _newQuote(_QuoteData data) async {
    final customerId = ValueNotifier<String?>(null);
    final validUntil = ValueNotifier<DateTime?>(DateTime.now().add(const Duration(days: 7)));
    final discount = TextEditingController(text: '0');
    final notes = TextEditingController();
    final items = <_QuoteItemDraft>[_QuoteItemDraft()];
    final formKey = GlobalKey<FormState>();

    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(builder: (context, setDialogState) {
        final subtotal = items.fold<double>(0, (sum, item) => sum + item.quantity * item.unitPrice);
        final discountValue = double.tryParse(discount.text.replaceAll(',', '.')) ?? 0;
        final total = (subtotal - discountValue).clamp(0, double.infinity);
        return AlertDialog(
          title: const Text('Novo orçamento'),
          content: SizedBox(width: 620, child: Form(
            key: formKey,
            child: SingleChildScrollView(child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: customerId.value,
                  decoration: const InputDecoration(labelText: 'Cliente *'),
                  items: data.customers.map((c) => DropdownMenuItem<String>(
                    value: c['id'] as String,
                    child: Text(c['name'] as String? ?? 'Cliente', overflow: TextOverflow.ellipsis),
                  )).toList(),
                  onChanged: (value) => setDialogState(() => customerId.value = value),
                  validator: (value) => value == null ? 'Selecione um cliente.' : null,
                ),
                const SizedBox(height: 8),
                ValueListenableBuilder<DateTime?>(
                  valueListenable: validUntil,
                  builder: (context, date, _) => OutlinedButton.icon(
                    onPressed: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: date ?? DateTime.now().add(const Duration(days: 7)),
                        firstDate: DateTime.now(),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null) setDialogState(() => validUntil.value = picked);
                    },
                    icon: const Icon(Icons.calendar_today_outlined),
                    label: Text('Validade: ${date == null ? 'Sem validade' : _date(date.toIso8601String())}'),
                  ),
                ),
                const SizedBox(height: 12),
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Text('Itens do orçamento', style: Theme.of(context).textTheme.titleMedium),
                  TextButton.icon(
                    onPressed: () => setDialogState(() => items.add(_QuoteItemDraft())),
                    icon: const Icon(Icons.add),
                    label: const Text('Adicionar item'),
                  ),
                ]),
                ...items.asMap().entries.map((entry) {
                  final index = entry.key;
                  final item = entry.value;
                  return Card(
                    key: ObjectKey(item),
                    margin: const EdgeInsets.only(bottom: 8),
                    child: Padding(
                      padding: const EdgeInsets.all(10),
                      child: Column(children: [
                        DropdownButtonFormField<String>(
                          initialValue: item.kind,
                          decoration: InputDecoration(labelText: 'Tipo do item ${index + 1}'),
                          items: const [
                            DropdownMenuItem(value: 'product', child: Text('Brinquedo')),
                            DropdownMenuItem(value: 'service', child: Text('Serviço')),
                            DropdownMenuItem(value: 'custom', child: Text('Item personalizado')),
                          ],
                          onChanged: (value) => setDialogState(() {
                            item.kind = value ?? 'product';
                            item.selectedId = null;
                            item.description.clear();
                            item.unitPrice = 0;
                          }),
                        ),
                        if (item.kind == 'product')
                          DropdownButtonFormField<String>(
                            initialValue: item.selectedId,
                            decoration: const InputDecoration(labelText: 'Brinquedo'),
                            items: data.products.map((p) => DropdownMenuItem<String>(
                              value: p['id'] as String,
                              child: Text(p['name'] as String? ?? 'Brinquedo', overflow: TextOverflow.ellipsis),
                            )).toList(),
                            onChanged: (value) => setDialogState(() {
                              item.selectedId = value;
                              final matches = data.products.where((p) => p['id'] == value);
                              if (matches.isNotEmpty) {
                                final selected = matches.first;
                                item.description.text = selected['name']?.toString() ?? 'Brinquedo';
                                item.unitPrice = (selected['daily_price'] as num? ?? 0).toDouble();
                              }
                            }),
                          ),
                        if (item.kind == 'service')
                          DropdownButtonFormField<String>(
                            initialValue: item.selectedId,
                            decoration: const InputDecoration(labelText: 'Serviço'),
                            items: data.services.map((s) => DropdownMenuItem<String>(
                              value: s['id'] as String,
                              child: Text(s['name'] as String? ?? 'Serviço', overflow: TextOverflow.ellipsis),
                            )).toList(),
                            onChanged: (value) => setDialogState(() {
                              item.selectedId = value;
                              final matches = data.services.where((s) => s['id'] == value);
                              if (matches.isNotEmpty) {
                                final selected = matches.first;
                                item.description.text = selected['name']?.toString() ?? 'Serviço';
                                item.unitPrice = (selected['price'] as num? ?? 0).toDouble();
                              }
                            }),
                          ),
                        TextFormField(
                          controller: item.description,
                          decoration: const InputDecoration(labelText: 'Descrição'),
                          validator: (value) => value == null || value.trim().isEmpty ? 'Informe a descrição.' : null,
                        ),
                        Row(children: [
                          Expanded(child: TextFormField(
                            initialValue: item.quantity.toString(),
                            decoration: const InputDecoration(labelText: 'Quantidade'),
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            validator: (value) => (double.tryParse((value ?? '').replaceAll(',', '.')) ?? 0) <= 0 ? 'Inválida' : null,
                            onChanged: (value) => setDialogState(() => item.quantity = double.tryParse(value.replaceAll(',', '.')) ?? 0),
                          )),
                          const SizedBox(width: 10),
                          Expanded(child: TextFormField(
                            key: ValueKey('quote-price-$index-${item.selectedId ?? item.kind}'),
                            initialValue: item.unitPrice.toStringAsFixed(2),
                            decoration: const InputDecoration(labelText: 'Preço unitário (R\$)'),
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            validator: (value) => (double.tryParse((value ?? '').replaceAll(',', '.')) ?? -1) < 0 ? 'Inválido' : null,
                            onChanged: (value) => setDialogState(() => item.unitPrice = double.tryParse(value.replaceAll(',', '.')) ?? 0),
                          )),
                        ]),
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton.icon(
                            onPressed: items.length == 1 ? null : () {
                              setDialogState(() => items.removeAt(index));
                              item.dispose();
                            },
                            icon: const Icon(Icons.delete_outline),
                            label: const Text('Remover item'),
                          ),
                        ),
                      ]),
                    ),
                  );
                }),
                TextFormField(
                  controller: discount,
                  decoration: const InputDecoration(labelText: 'Desconto (R\$)'),
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  validator: (value) {
                    final amount = double.tryParse((value ?? '').replaceAll(',', '.')) ?? -1;
                    return amount < 0 || amount > subtotal ? 'Desconto inválido.' : null;
                  },
                  onChanged: (_) => setDialogState(() {}),
                ),
                TextFormField(controller: notes, maxLines: 2, decoration: const InputDecoration(labelText: 'Observações')),
                const SizedBox(height: 10),
                Text('Subtotal: ${_money(subtotal)}'),
                Text('Total: ${_money(total)}', style: Theme.of(context).textTheme.titleMedium),
              ],
            )),
          )),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () {
                if (formKey.currentState!.validate() &&
                    items.every((item) => item.description.text.trim().isNotEmpty && item.quantity > 0 && item.unitPrice >= 0) &&
                    items.every((item) => item.kind == 'custom' || item.selectedId != null)) {
                  Navigator.pop(dialogContext, true);
                }
              },
              child: const Text('Criar orçamento'),
            ),
          ],
        );
      }),
    );

    if (saved == true && mounted) {
      setState(() => _busy = true);
      try {
        final discountValue = double.tryParse(discount.text.replaceAll(',', '.')) ?? 0;
        final rpcItems = items.map((item) => {
          'product_id': item.kind == 'product' ? item.selectedId : null,
          'service_id': item.kind == 'service' ? item.selectedId : null,
          'description': item.description.text.trim(),
          'quantity': item.quantity,
          'unit_price': item.unitPrice,
        }).toList();
        await _client.rpc('create_quote_with_items', params: {
          'p_company_id': widget.companyId,
          'p_customer_id': customerId.value,
          'p_valid_until': validUntil.value == null ? null : DateFormat('yyyy-MM-dd').format(validUntil.value!),
          'p_discount': discountValue,
          'p_notes': notes.text.trim().isEmpty ? null : notes.text.trim(),
          'p_items': rpcItems,
        });
        await _reload();
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Orçamento criado.')));
      } catch (error) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Não foi possível criar o orçamento: $error')));
      } finally {
        if (mounted) setState(() => _busy = false);
      }
    }
    customerId.dispose();
    discount.dispose();
    notes.dispose();
    for (final item in items) {
      item.dispose();
    }
  }

  Future<void> _printQuote(Map<String, dynamic> quote) async {
    final customer = quote['customers'] as Map<String, dynamic>? ?? {};
    final items = (quote['quote_items'] as List? ?? []).whereType<Map>().toList();
    final document = pw.Document();
    document.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(34),
      build: (context) => [
        pw.Text('KIDSLOC APP', style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, letterSpacing: 2)),
        pw.SizedBox(height: 20),
        pw.Text('Orçamento #${quote['quote_number']}', style: pw.TextStyle(fontSize: 23, fontWeight: pw.FontWeight.bold)),
        pw.SizedBox(height: 8),
        pw.Text('Cliente: ${customer['name'] ?? 'Não informado'}'),
        pw.Text('Emissão: ${_date(quote['issue_date'])}'),
        pw.Text('Validade: ${_date(quote['valid_until'])}'),
        pw.SizedBox(height: 18),
        pw.TableHelper.fromTextArray(
          headers: ['Descrição', 'Qtd.', 'Unitário', 'Subtotal'],
          data: items.map((item) => [
            item['description']?.toString() ?? '',
            (item['quantity'] as num? ?? 0).toString(),
            _money(item['unit_price'] as num? ?? 0),
            _money(item['subtotal'] as num? ?? 0),
          ]).toList(),
          headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9),
          cellStyle: const pw.TextStyle(fontSize: 9),
          border: pw.TableBorder.all(color: PdfColors.grey300, width: 0.5),
          cellPadding: const pw.EdgeInsets.all(7),
        ),
        pw.SizedBox(height: 18),
        pw.Align(alignment: pw.Alignment.centerRight, child: pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.end,
          children: [
            pw.Text('Subtotal: ${_money(quote['subtotal'] as num? ?? 0)}'),
            pw.Text('Desconto: ${_money(quote['discount'] as num? ?? 0)}'),
            pw.SizedBox(height: 6),
            pw.Text('Total: ${_money(quote['total_amount'] as num? ?? 0)}', style: pw.TextStyle(fontSize: 17, fontWeight: pw.FontWeight.bold)),
          ],
        )),
        if ((quote['notes']?.toString() ?? '').trim().isNotEmpty) ...[
          pw.SizedBox(height: 18),
          pw.Text('Observações: ${quote['notes']}'),
        ],
        pw.SizedBox(height: 28),
        pw.Text('Documento gerado pelo KidsLoc App.', style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey600)),
      ],
    ));
    await Printing.layoutPdf(
      onLayout: (format) async => document.save(),
      name: 'orcamento-kidsloc-${quote['quote_number']}.pdf',
    );
  }

  Future<void> _prepareWhatsApp(Map<String, dynamic> quote) async {
    final customer = quote['customers'] as Map<String, dynamic>? ?? {};
    final text = 'Olá, ${customer['name'] ?? 'tudo bem'}! Segue o orçamento #${quote['quote_number']} no valor de ${_money(quote['total_amount'] as num? ?? 0)}. Validade: ${_date(quote['valid_until'])}. Vou anexar o PDF do orçamento nesta conversa.';
    final uri = Uri.parse('https://wa.me/?text=${Uri.encodeComponent(text)}');
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Não foi possível abrir o WhatsApp.')));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Orçamentos'), actions: [
      IconButton(tooltip: 'Atualizar', onPressed: _reload, icon: const Icon(Icons.refresh)),
    ]),
    floatingActionButton: FloatingActionButton.extended(
      onPressed: _busy ? null : () async {
        try {
          final data = await _future;
          if (mounted) await _newQuote(data);
        } catch (error) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Não foi possível abrir o formulário de orçamento: $error')),
            );
          }
        }
      },
      icon: const Icon(Icons.add),
      label: const Text('Novo orçamento'),
    ),
    body: FutureBuilder<_QuoteData>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) { return const Center(child: CircularProgressIndicator()); }
        if (snapshot.hasError) { return Center(child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('Não foi possível carregar os orçamentos. ${snapshot.error}', textAlign: TextAlign.center),
            OutlinedButton(onPressed: _reload, child: const Text('Tentar novamente')),
          ]),
        )); }
        final data = snapshot.data!;
        if (data.quotes.isEmpty) return const Center(child: Text('Nenhum orçamento cadastrado.'));
        return RefreshIndicator(
          onRefresh: _reload,
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
            itemCount: data.quotes.length,
            separatorBuilder: (_, index) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final quote = data.quotes[index];
              final customer = (quote['customers'] as Map?)?['name']?.toString() ?? 'Cliente';
              final count = (quote['quote_items'] as List? ?? []).length;
              return Card(child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Orçamento #${quote['quote_number']} · $customer', style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 4),
                  Text('${_date(quote['issue_date'])} · Validade: ${_date(quote['valid_until'])} · $count item(ns)'),
                  const SizedBox(height: 4),
                  Text(_money(quote['total_amount'] as num? ?? 0), style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, children: [
                    OutlinedButton.icon(
                      onPressed: () => _printQuote(quote),
                      icon: const Icon(Icons.picture_as_pdf_outlined),
                      label: const Text('Imprimir / PDF'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _prepareWhatsApp(quote),
                      icon: const Icon(Icons.chat_outlined),
                      label: const Text('WhatsApp'),
                    ),
                  ]),
                ]),
              ));
            },
          ),
        );
      },
    ),
  );
}

class _QuoteData {
  const _QuoteData({required this.quotes, required this.customers, required this.products, required this.services});
  final List<Map<String, dynamic>> quotes;
  final List<Map<String, dynamic>> customers;
  final List<Map<String, dynamic>> products;
  final List<Map<String, dynamic>> services;
}

class _QuoteItemDraft {
  String kind = 'product';
  String? selectedId;
  final TextEditingController description = TextEditingController();
  double quantity = 1;
  double unitPrice = 0;
  void dispose() => description.dispose();
}
