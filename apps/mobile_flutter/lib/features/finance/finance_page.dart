import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../data/company_data_repository.dart';

class FinancePage extends StatefulWidget {
  const FinancePage({super.key, required this.companyId});
  final String companyId;

  @override
  State<FinancePage> createState() => _FinancePageState();
}

class _FinancePageState extends State<FinancePage> {
  late final CompanyDataRepository _repository = CompanyDataRepository(
    client: Supabase.instance.client,
    companyId: widget.companyId,
  );
  late Future<_FinanceData> _future = _load();
  final _paymentAmount = TextEditingController();
  final _paymentNotes = TextEditingController();
  String _search = '';
  String? _paymentRentalId;
  String _paymentMethod = 'pix';
  bool _paymentOpen = false;
  bool _busy = false;

  Future<_FinanceData> _load() async {
    final results = await Future.wait([
      _repository.fetchTransactions(),
      _repository.fetchRentals(),
    ]);
    final rentals = results[1].where((r) => r['status'] != 'cancelled').toList();
    return _FinanceData(transactions: results[0], rentals: rentals);
  }

  Future<void> _reload() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  String _money(num value) => value.toStringAsFixed(2).replaceAll('.', ',');
  String _date(dynamic value) {
    final parsed = DateTime.tryParse(value?.toString() ?? '');
    return parsed == null ? '—' : DateFormat('dd/MM/yyyy').format(parsed.toLocal());
  }

  Future<void> _edit([Map<String, dynamic>? row]) async {
    final description = TextEditingController(text: row?['description'] as String? ?? '');
    final amount = TextEditingController(text: row == null ? '' : (row['amount'] as num).toString());
    var type = row?['transaction_type'] as String? ?? 'income';
    final key = GlobalKey<FormState>();
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(builder: (context, setDialogState) => AlertDialog(
        title: Text(row == null ? 'Novo lançamento' : 'Editar lançamento'),
        content: SizedBox(width: 420, child: Form(key: key, child: SingleChildScrollView(child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(controller: description, maxLength: 160, decoration: const InputDecoration(labelText: 'Descrição'), validator: (v) => v == null || v.trim().isEmpty ? 'Informe a descrição.' : null),
            DropdownButtonFormField<String>(
              initialValue: type,
              decoration: const InputDecoration(labelText: 'Tipo'),
              items: const [
                DropdownMenuItem(value: 'income', child: Text('Entrada')),
                DropdownMenuItem(value: 'expense', child: Text('Saída')),
              ],
              onChanged: (v) => setDialogState(() => type = v ?? type),
            ),
            TextFormField(controller: amount, decoration: const InputDecoration(labelText: 'Valor (R\$)'), keyboardType: const TextInputType.numberWithOptions(decimal: true), validator: (v) => (double.tryParse((v ?? '').replaceAll(',', '.')) ?? 0) <= 0 ? 'Informe um valor maior que zero.' : null),
          ],
        )))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () { if (key.currentState!.validate()) Navigator.pop(dialogContext, true); }, child: const Text('Salvar')),
        ],
      )),
    );
    if (saved == true && mounted) {
      setState(() => _busy = true);
      try {
        await _repository.saveTransaction(
          id: row?['id'] as String?,
          type: type,
          description: description.text,
          amount: double.parse(amount.text.replaceAll(',', '.')),
        );
        await _reload();
      } catch (error) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Não foi possível salvar: $error')));
      } finally {
        if (mounted) setState(() => _busy = false);
      }
    }
    description.dispose();
    amount.dispose();
  }

  Future<void> _delete(Map<String, dynamic> row) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Excluir lançamento?'),
        content: Text('Deseja excluir "${row['description']}"?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Excluir')),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _busy = true);
    try {
      await _repository.deleteTransaction(row['id'] as String);
      await _reload();
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Não foi possível excluir: $error')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _registerPayment(List<Map<String, dynamic>> rentals) async {
    final amount = double.tryParse(_paymentAmount.text.replaceAll(',', '.'));
    if (_paymentRentalId == null || amount == null || !amount.isFinite || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Selecione a locação e informe um valor válido.')));
      return;
    }
    setState(() => _busy = true);
    try {
      final paymentId = await _repository.registerRentalPayment(
        rentalId: _paymentRentalId!,
        amount: amount,
        paymentMethod: _paymentMethod,
        notes: _paymentNotes.text,
      );
      final payment = await _repository.fetchRentalPayment(paymentId);
      await _reload();
      if (!mounted) return;
      setState(() {
        _paymentOpen = false;
        _paymentRentalId = null;
        _paymentAmount.clear();
        _paymentNotes.clear();
        _paymentMethod = 'pix';
      });
      try {
        await _printReceipt(payment);
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pagamento registrado e recibo gerado.')));
      } catch (printError) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Pagamento registrado, mas não foi possível abrir a impressão do recibo: $printError')));
      }
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Não foi possível registrar o pagamento: $error')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _printReceipt(Map<String, dynamic> payment) async {
    final rental = payment['rentals'] as Map<String, dynamic>? ?? {};
    final customer = rental['customers'] as Map<String, dynamic>? ?? {};
    final methodLabels = {
      'pix': 'Pix',
      'cash': 'Dinheiro',
      'card': 'Cartão',
      'bank_transfer': 'Transferência bancária',
      'other': 'Outro',
    };
    final paidAt = DateTime.tryParse(payment['paid_at']?.toString() ?? '')?.toLocal();
    final document = pw.Document();
    document.addPage(pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(38),
      build: (context) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Text('KIDSLOC APP', style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, letterSpacing: 2)),
          pw.SizedBox(height: 24),
          pw.Text('Recibo de pagamento', style: pw.TextStyle(fontSize: 24, fontWeight: pw.FontWeight.bold)),
          pw.Text('Comprovante de recebimento', style: const pw.TextStyle(fontSize: 11, color: PdfColors.grey700)),
          pw.SizedBox(height: 28),
          pw.Container(
            width: double.infinity,
            padding: const pw.EdgeInsets.all(18),
            color: PdfColors.blue50,
            child: pw.Text('R\$ ${_money(payment['amount'] as num)}', style: pw.TextStyle(fontSize: 26, fontWeight: pw.FontWeight.bold)),
          ),
          pw.SizedBox(height: 18),
          _receiptLine('Recibo', (payment['id'] as String).substring(0, 8).toUpperCase()),
          _receiptLine('Locação', '#${rental['rental_number'] ?? ''}'),
          _receiptLine('Cliente', customer['name']?.toString() ?? 'Não informado'),
          _receiptLine('Data', paidAt == null ? '—' : DateFormat('dd/MM/yyyy').format(paidAt)),
          _receiptLine('Forma de pagamento', methodLabels[payment['payment_method']] ?? payment['payment_method'].toString()),
          pw.SizedBox(height: 24),
          pw.Text((payment['notes']?.toString().trim().isNotEmpty ?? false) ? payment['notes'].toString() : 'Pagamento recebido e registrado no KidsLoc.', style: const pw.TextStyle(fontSize: 11)),
          pw.Spacer(),
          pw.Divider(color: PdfColors.grey400),
          pw.Text('Documento emitido pelo KidsLoc App.', style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey600)),
        ],
      ),
    ));
    await Printing.layoutPdf(
      onLayout: (format) async => document.save(),
      name: 'recibo-kidsloc-${(payment['id'] as String).substring(0, 8)}.pdf',
    );
  }

  pw.Widget _receiptLine(String label, String value) => pw.Padding(
    padding: const pw.EdgeInsets.symmetric(vertical: 9),
    child: pw.Row(
      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
      children: [
        pw.Text(label, style: const pw.TextStyle(color: PdfColors.grey700, fontSize: 11)),
        pw.SizedBox(width: 16),
        pw.Expanded(child: pw.Text(value, textAlign: pw.TextAlign.right, style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold))),
      ],
    ),
  );

  @override
  void dispose() {
    _paymentAmount.dispose();
    _paymentNotes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Financeiro'), actions: [
      IconButton(tooltip: 'Atualizar', onPressed: _reload, icon: const Icon(Icons.refresh)),
    ]),
    floatingActionButton: FloatingActionButton.extended(
      onPressed: _busy ? null : () => _edit(),
      icon: const Icon(Icons.add),
      label: const Text('Lançamento'),
    ),
    body: FutureBuilder<_FinanceData>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
        if (snapshot.hasError) return Center(child: Text('Não foi possível carregar o financeiro. ${snapshot.error}'));
        final data = snapshot.data!;
        final rows = data.transactions;
        final income = rows.where((r) => r['transaction_type'] == 'income').fold<num>(0, (sum, r) => sum + (r['amount'] as num));
        final expense = rows.where((r) => r['transaction_type'] == 'expense').fold<num>(0, (sum, r) => sum + (r['amount'] as num));
        final filtered = rows.where((r) => (r['description'] as String? ?? '').toLowerCase().contains(_search)).toList();
        return RefreshIndicator(
          onRefresh: _reload,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : () => setState(() => _paymentOpen = !_paymentOpen),
                  icon: const Icon(Icons.receipt_long_outlined),
                  label: const Text('Registrar recebimento'),
                ),
              ),
              if (_paymentOpen) _paymentForm(data.rentals),
              const SizedBox(height: 8),
              Wrap(spacing: 10, runSpacing: 10, children: [
                _summary('Entradas', income),
                _summary('Saídas', expense),
                _summary('Saldo registrado', income - expense),
              ]),
              const SizedBox(height: 16),
              TextField(
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Pesquisar movimentação...', border: OutlineInputBorder()),
                onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
              ),
              const SizedBox(height: 12),
              if (filtered.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('Nenhuma movimentação encontrada.'))),
              ...filtered.map((row) => Card(child: ListTile(
                leading: CircleAvatar(child: Icon(row['transaction_type'] == 'income' ? Icons.south_west : Icons.north_east)),
                title: Text(row['description'] as String? ?? 'Lançamento'),
                subtitle: Text('${row['transaction_type'] == 'income' ? 'Entrada' : 'Saída'} · ${_date(row['paid_at'] ?? row['created_at'])}'),
                trailing: SizedBox(width: 124, child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('R\$ ${_money(row['amount'] as num)}', style: const TextStyle(fontWeight: FontWeight.w600)),
                    Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                      IconButton(visualDensity: VisualDensity.compact, tooltip: 'Editar', onPressed: _busy ? null : () => _edit(row), icon: const Icon(Icons.edit_outlined, size: 18)),
                      IconButton(visualDensity: VisualDensity.compact, tooltip: 'Excluir', onPressed: _busy ? null : () => _delete(row), icon: const Icon(Icons.delete_outline, size: 18)),
                    ]),
                  ],
                )),
              ))),
            ],
          ),
        );
      },
    ),
  );

  Widget _paymentForm(List<Map<String, dynamic>> rentals) => Card(
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Registrar recebimento e emitir recibo', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _paymentRentalId,
            decoration: const InputDecoration(labelText: 'Locação'),
            items: rentals.map((r) => DropdownMenuItem<String>(
              value: r['id'] as String,
              child: Text('#${r['rental_number'] ?? '—'} · ${(r['customers'] as Map?)?['name'] ?? 'Cliente'} · R\$ ${_money(r['total_amount'] as num)}', overflow: TextOverflow.ellipsis),
            )).toList(),
            onChanged: (value) => setState(() => _paymentRentalId = value),
          ),
          TextField(controller: _paymentAmount, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Valor recebido (R\$)', hintText: '0,00')),
          DropdownButtonFormField<String>(
            initialValue: _paymentMethod,
            decoration: const InputDecoration(labelText: 'Forma de pagamento'),
            items: const [
              DropdownMenuItem(value: 'pix', child: Text('Pix')),
              DropdownMenuItem(value: 'cash', child: Text('Dinheiro')),
              DropdownMenuItem(value: 'card', child: Text('Cartão')),
              DropdownMenuItem(value: 'bank_transfer', child: Text('Transferência bancária')),
              DropdownMenuItem(value: 'other', child: Text('Outro')),
            ],
            onChanged: (value) => setState(() => _paymentMethod = value ?? 'pix'),
          ),
          TextField(controller: _paymentNotes, maxLength: 300, decoration: const InputDecoration(labelText: 'Observações')),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: _busy ? null : () => _registerPayment(rentals),
            child: Text(_busy ? 'Registrando...' : 'Confirmar pagamento e gerar recibo'),
          ),
          TextButton(
            onPressed: _busy ? null : () => setState(() => _paymentOpen = false),
            child: const Text('Cancelar'),
          ),
          const Text('O recebimento será lançado no financeiro, vinculado à locação, e um documento de recibo será registrado.', style: TextStyle(fontSize: 11)),
        ],
      ),
    ),
  );

  Widget _summary(String label, num value) => SizedBox(
    width: 155,
    child: Card(child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: Theme.of(context).textTheme.labelMedium),
        const SizedBox(height: 6),
        Text('R\$ ${_money(value)}', style: Theme.of(context).textTheme.titleMedium),
      ]),
    )),
  );
}

class _FinanceData {
  const _FinanceData({required this.transactions, required this.rentals});
  final List<Map<String, dynamic>> transactions;
  final List<Map<String, dynamic>> rentals;
}
