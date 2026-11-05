import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class ContractsPage extends StatefulWidget {
  const ContractsPage({super.key, required this.companyId, required this.companyName});
  final String companyId;
  final String companyName;
  @override
  State<ContractsPage> createState() => _ContractsPageState();
}

class _ContractsPageState extends State<ContractsPage> {
  final _db = Supabase.instance.client;
  final _currency = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');
  final _date = DateFormat('dd/MM/yyyy');
  List<Map<String, dynamic>> _rentals = [];
  List<Map<String, dynamic>> _contracts = [];
  final Map<String, String> _tokens = {};
  String? _rentalId;
  String _method = 'external';
  bool _loading = true;
  bool _busy = false;

  static const _clauses = [
    'O contratante declara que recebeu as informações sobre os brinquedos alugados e compromete-se a utilizá-los conforme as orientações fornecidas pela locadora.',
    'O contratante deverá zelar pela conservação dos equipamentos durante todo o período da locação e impedir o uso inadequado ou por pessoas não autorizadas.',
    'Danos, perdas ou avarias decorrentes de mau uso, negligência ou descumprimento das orientações deverão ser comunicados imediatamente e poderão gerar obrigação de ressarcimento, mediante apuração.',
    'A utilização deverá ocorrer no período contratado. A devolução ou retirada deverá respeitar as datas e condições combinadas com a locadora.',
    'Os valores, descontos, taxas e condições de pagamento são os apresentados neste contrato e no resumo da locação.',
    'O contratante declara ser responsável por supervisionar a utilização dos brinquedos e por seguir as instruções de segurança entregues pela locadora.',
    'Alterações e cancelamentos deverão ser comunicados à locadora e dependerão de confirmação entre as partes.',
  ];

  @override
  void initState() { super.initState(); _load(); }

  String _digits(Object? value) => (value?.toString() ?? '').replaceAll(RegExp(r'[^0-9]'), '');
  String _token() {
    final random = Random.secure();
    return List<int>.generate(32, (_) => random.nextInt(256))
        .map((v) => v.toRadixString(16).padLeft(2, '0')).join();
  }
  String _hash(String value) => sha256.convert(utf8.encode(value)).toString();
  String _dateText(Object? value) {
    final parsed = DateTime.tryParse(value?.toString() ?? '');
    return parsed == null ? '—' : _date.format(parsed);
  }
  void _message(String value) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(value)));
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    try {
      final data = await Future.wait([
        _db.from('rentals').select('id,rental_number,start_date,end_date,total_amount,deposit_amount,delivery_address,notes,customers(name,phone,address),rental_items(quantity,unit_price,subtotal,products(name))')
          .eq('company_id', widget.companyId).order('created_at', ascending: false),
        _db.from('rental_contracts').select('*').eq('company_id', widget.companyId).order('created_at', ascending: false),
      ]);
      if (!mounted) return;
      setState(() {
        _rentals = List<Map<String, dynamic>>.from(data[0]);
        _contracts = List<Map<String, dynamic>>.from(data[1]);
      });
    } catch (e) {
      _message('Falha ao carregar contratos: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Map<String, dynamic> _snapshot(Map<String, dynamic> rental) {
    final customer = Map<String, dynamic>.from(rental['customers'] as Map? ?? {});
    final items = (rental['rental_items'] as List? ?? []).map((raw) {
      final item = Map<String, dynamic>.from(raw as Map);
      final product = Map<String, dynamic>.from(item['products'] as Map? ?? {});
      return {'name': product['name'] ?? 'Brinquedo', 'quantity': item['quantity'] ?? 1,
        'dailyPrice': item['unit_price'] ?? 0, 'subtotal': item['subtotal'] ?? 0};
    }).toList();
    return {
      'companyName': widget.companyName, 'customerName': customer['name'] ?? 'Cliente',
      'customerPhone': customer['phone'] ?? '', 'customerAddress': customer['address'] ?? rental['delivery_address'] ?? '',
      'startDate': rental['start_date'], 'endDate': rental['end_date'],
      'totalAmount': rental['total_amount'] ?? 0, 'rentalNumber': rental['rental_number'],
      'items': items, 'clauses': _clauses, 'depositAmount': rental['deposit_amount'] ?? 0,
      'deliveryAddress': rental['delivery_address'] ?? '', 'rentalNotes': rental['notes'] ?? '',
    };
  }

  Future<Uint8List> _pdf(Map<String, dynamic> data, int number) async {
    final doc = pw.Document();
    final items = (data['items'] as List? ?? []).map((raw) {
      final item = Map<String, dynamic>.from(raw as Map);
      return pw.Row(children: [
        pw.Expanded(flex: 4, child: pw.Text('${item['name']} × ${item['quantity']}')),
        pw.Expanded(flex: 3, child: pw.Text('Diária: ${_currency.format(item['dailyPrice'] ?? 0)}')),
        pw.Expanded(flex: 3, child: pw.Text('Subtotal: ${_currency.format(item['subtotal'] ?? 0)}')),
      ]);
    }).toList();
    doc.addPage(pw.MultiPage(build: (_) => [
      pw.Text('CONTRATO DE LOCAÇÃO DE BRINQUEDOS', style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold)),
      pw.Text('Contrato nº $number'), pw.SizedBox(height: 12),
      pw.Text('LOCADORA', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
      pw.Text('${data['companyName']}'), pw.SizedBox(height: 8),
      pw.Text('CLIENTE', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
      pw.Text('Nome: ${data['customerName']}'), pw.Text('Telefone: ${data['customerPhone']}'),
      pw.Text('Endereço: ${data['customerAddress']}'),
      pw.Text('Período: ${_dateText(data['startDate'])} até ${_dateText(data['endDate'])}'),
      pw.Text('Endereço de entrega: ${data['deliveryAddress']}'), pw.SizedBox(height: 12),
      pw.Text('ITENS LOCADOS', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)), ...items,
      pw.SizedBox(height: 8),
      pw.Text('Valor total: ${_currency.format(data['totalAmount'] ?? 0)}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
      pw.Text('Caução/garantia: ${_currency.format(data['depositAmount'] ?? 0)}'),
      if ((data['rentalNotes'] ?? '').toString().isNotEmpty) pw.Text('Observações: ${data['rentalNotes']}'),
      pw.SizedBox(height: 12), pw.Text('CONDIÇÕES', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
      ...(data['clauses'] as List).asMap().entries.map((e) => pw.Text('${e.key + 1}. ${e.value}')),
      pw.SizedBox(height: 36),
      pw.Row(children: [
        pw.Expanded(child: pw.Column(children: [pw.Divider(), pw.Text('LOCADORA')])),
        pw.SizedBox(width: 24),
        pw.Expanded(child: pw.Column(children: [pw.Divider(), pw.Text('CONTRATANTE')])),
      ]),
    ]));
    return doc.save();
  }

  Future<void> _create() async {
    Map<String, dynamic>? rental;
    for (final row in _rentals) { if (row['id'] == _rentalId) rental = row; }
    if (rental == null || _rentalId == null) { _message('Selecione uma locação.'); return; }
    final phone = _digits((rental['customers'] as Map?)?['phone']);
    if (phone.length < 10 || phone.length > 13) { _message('Cadastre um telefone válido com DDD.'); return; }
    setState(() => _busy = true);
    try {
      final token = _method == 'in_app' ? _token() : null;
      final snapshot = _snapshot(rental);
      final row = await _db.from('rental_contracts').insert({
        'company_id': widget.companyId, 'rental_id': _rentalId, 'signature_method': _method,
        'status': 'draft', 'contract_snapshot': snapshot, 'token_hash': token == null ? null : _hash(token),
        'token_expires_at': token == null ? null : DateTime.now().add(const Duration(days: 7)).toIso8601String(),
        'created_by': _db.auth.currentUser?.id,
      }).select().single();
      if (token != null) _tokens[row['id'] as String] = token;
      if (_method == 'external') {
        final bytes = await _pdf(snapshot, (row['contract_number'] as num).toInt());
        final path = '${widget.companyId}/${row['id']}/contrato-original.pdf';
        await _db.storage.from('rental-contracts').uploadBinary(path, bytes,
          fileOptions: const FileOptions(contentType: 'application/pdf', upsert: true));
        await _db.from('rental_contracts').update({'original_pdf_path': path})
          .eq('id', row['id']).eq('company_id', widget.companyId);
        await Printing.sharePdf(bytes: bytes, filename: 'contrato-kidsloc-${row['contract_number']}.pdf');
      }
      if (!mounted) return;
      setState(() => _rentalId = null);
      await _load();
      _message(_method == 'external'
          ? 'PDF preparado para compartilhar. Envie ao cliente e marque como enviado.'
          : 'Contrato criado. Envie o link ao cliente e marque como enviado.');
    } catch (e) {
      _message('Não foi possível criar o contrato: $e');
    } finally { if (mounted) setState(() => _busy = false); }
  }

  Future<void> _newLink(Map<String, dynamic> contract) async {
    setState(() => _busy = true);
    try {
      final token = _token();
      final row = await _db.from('rental_contracts').update({
        'token_hash': _hash(token), 'token_expires_at': DateTime.now().add(const Duration(days: 7)).toIso8601String(),
        'status': 'draft', 'sent_at': null, 'viewed_at': null,
      }).eq('id', contract['id']).eq('company_id', widget.companyId)
        .neq('status', 'signed').select('id').maybeSingle();
      if (row == null) throw Exception('Não foi possível renovar o link.');
      _tokens[contract['id'] as String] = token;
      await _load();
      _message('Novo link criado. Envie pelo WhatsApp e marque como enviado.');
    } catch (e) { _message('Falha ao gerar link: $e'); }
    finally { if (mounted) setState(() => _busy = false); }
  }

  Future<void> _whatsApp(Map<String, dynamic> contract) async {
    final data = Map<String, dynamic>.from(contract['contract_snapshot'] as Map? ?? {});
    final phone = _digits(data['customerPhone']);
    if (phone.length < 10 || phone.length > 13) { _message('Telefone do cliente inválido.'); return; }
    var text = 'Olá! Estou enviando seu contrato em PDF. Assine pelo Gov.br ou outro serviço e devolva o PDF assinado por aqui.';
    if (contract['signature_method'] == 'in_app') {
      var token = _tokens[contract['id']];
      if (token == null) { await _newLink(contract); token = _tokens[contract['id']]; }
      if (token == null) return;
      text = 'Olá! Seu contrato está disponível para leitura e assinatura pelo KidsLoc: https://vbf1.github.io/kidsloc-app/?contract=$token';
    }
    final uri = Uri.parse('https://wa.me/$phone').replace(queryParameters: {'text': text});
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) _message('Não foi possível abrir o WhatsApp.');
  }

  Future<void> _markSent(Map<String, dynamic> contract) async {
    setState(() => _busy = true);
    try {
      final row = await _db.from('rental_contracts').update({
        'status': 'sent', 'sent_at': DateTime.now().toIso8601String(),
      }).eq('id', contract['id']).eq('company_id', widget.companyId)
        .eq('status', 'draft').select('id').maybeSingle();
      if (row == null) throw Exception('Contrato não está mais como rascunho.');
      await _load(); _message('Contrato marcado como enviado.');
    } catch (e) { _message('Falha ao atualizar status: $e'); }
    finally { if (mounted) setState(() => _busy = false); }
  }

  Future<void> _uploadSigned(Map<String, dynamic> contract) async {
    final result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: const ['pdf'], withData: true);
    if (!mounted || result == null || result.files.isEmpty) return;
    final file = result.files.single;
    final bytes = file.bytes;
    if (bytes == null || file.size > 10 * 1024 * 1024) { _message('Selecione um PDF de até 10 MB.'); return; }
    setState(() => _busy = true);
    final path = '${widget.companyId}/${contract['id']}/contrato-assinado.pdf';
    try {
      await _db.storage.from('rental-contracts').uploadBinary(path, bytes,
        fileOptions: const FileOptions(contentType: 'application/pdf', upsert: true));
      final row = await _db.from('rental_contracts').update({
        'status': 'signed', 'signed_at': DateTime.now().toIso8601String(), 'signed_pdf_path': path,
      }).eq('id', contract['id']).eq('company_id', widget.companyId)
        .inFilter('status', ['sent', 'viewed']).select('id').maybeSingle();
      if (row == null) throw Exception('Marque o contrato como enviado antes de anexar a assinatura.');
      await _load(); _message('PDF assinado anexado.');
    } catch (e) { _message('Falha ao anexar o PDF: $e'); }
    finally { if (mounted) setState(() => _busy = false); }
  }

  Future<void> _openPdf(String path) async {
    try {
      final url = await _db.storage.from('rental-contracts').createSignedUrl(path, 300);
      if (!await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication)) _message('Não foi possível abrir o PDF.');
    } catch (e) { _message('Falha ao abrir o PDF: $e'); }
  }

  Future<void> _cancel(Map<String, dynamic> contract) async {
    final ok = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
      title: const Text('Cancelar contrato?'),
      content: const Text('O link deixará de funcionar e o histórico será mantido.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Voltar')),
        FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Cancelar')),
      ],
    ));
    if (!mounted || ok != true) return;
    setState(() => _busy = true);
    try {
      await _db.from('rental_contracts').update({
        'status': 'cancelled', 'token_hash': null, 'token_expires_at': null,
      }).eq('id', contract['id']).eq('company_id', widget.companyId).neq('status', 'signed');
      await _load(); _message('Contrato cancelado.');
    } catch (e) { _message('Falha ao cancelar: $e'); }
    finally { if (mounted) setState(() => _busy = false); }
  }

  String _status(String value) => switch (value) {
    'draft' => 'Rascunho', 'sent' => 'Enviado', 'viewed' => 'Visualizado',
    'signed' => 'Assinado', 'cancelled' => 'Cancelado', 'expired' => 'Expirado', _ => value,
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Contratos de locação'),
        actions: [IconButton(onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh))]),
      body: _loading ? const Center(child: CircularProgressIndicator()) : RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('Novo contrato', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _rentalId, isExpanded: true, decoration: const InputDecoration(labelText: 'Locação'),
                items: _rentals.map((r) {
                  final name = (r['customers'] as Map?)?['name'] ?? 'Cliente';
                  return DropdownMenuItem(value: r['id'] as String,
                    child: Text('#${r['rental_number']} · $name · ${_dateText(r['start_date'])}', overflow: TextOverflow.ellipsis));
                }).toList(),
                onChanged: _busy ? null : (value) => setState(() => _rentalId = value),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _method, decoration: const InputDecoration(labelText: 'Modalidade de assinatura'),
                items: const [
                  DropdownMenuItem(value: 'external', child: Text('Gov.br ou outro serviço externo')),
                  DropdownMenuItem(value: 'in_app', child: Text('Assinar diretamente pelo KidsLoc')),
                ],
                onChanged: _busy ? null : (value) => setState(() => _method = value ?? 'external'),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _busy || _rentalId == null ? null : _create,
                icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.description_outlined),
                label: Text(_busy ? 'Preparando...' : 'Criar contrato'),
              ),
            ],
          ))),
          const SizedBox(height: 18),
          Text('Histórico de contratos', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          if (_contracts.isEmpty)
            const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('Nenhum contrato criado ainda.')))
          else
            ..._contracts.map((contract) {
              final data = Map<String, dynamic>.from(contract['contract_snapshot'] as Map? ?? {});
              final status = contract['status']?.toString() ?? 'draft';
              final terminal = ['signed', 'cancelled', 'expired'].contains(status);
              return Card(margin: const EdgeInsets.only(bottom: 10), child: Padding(
                padding: const EdgeInsets.all(14), child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text('Contrato #${contract['contract_number']}', style: Theme.of(context).textTheme.titleMedium)),
                      Chip(label: Text(_status(status))),
                    ]),
                    Text('${data['customerName'] ?? 'Cliente'} · Locação #${data['rentalNumber'] ?? '—'}'),
                    Text('${_dateText(data['startDate'])} a ${_dateText(data['endDate'])} · ${_currency.format(data['totalAmount'] ?? 0)}'),
                    Text(contract['signature_method'] == 'in_app' ? 'Assinatura pelo KidsLoc' : 'Assinatura externa',
                      style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 8),
                    Wrap(spacing: 8, runSpacing: 6, children: [
                      OutlinedButton.icon(onPressed: () async {
                        final bytes = await _pdf(data, (contract['contract_number'] as num).toInt());
                        await Printing.sharePdf(bytes: bytes, filename: 'contrato-kidsloc-${contract['contract_number']}.pdf');
                      }, icon: const Icon(Icons.picture_as_pdf_outlined), label: const Text('PDF')),
                      if (!terminal) OutlinedButton.icon(onPressed: () => _whatsApp(contract),
                        icon: const Icon(Icons.chat_outlined), label: const Text('WhatsApp')),
                      if (contract['signature_method'] == 'in_app' && !terminal) OutlinedButton.icon(
                        onPressed: _busy ? null : () => _newLink(contract),
                        icon: const Icon(Icons.link), label: const Text('Novo link')),
                      if (status == 'draft') FilledButton.tonal(onPressed: _busy ? null : () => _markSent(contract),
                        child: const Text('Marcar enviado')),
                      if (contract['signature_method'] == 'external' && ['sent', 'viewed'].contains(status))
                        OutlinedButton.icon(onPressed: _busy ? null : () => _uploadSigned(contract),
                          icon: const Icon(Icons.upload_file), label: const Text('Anexar assinado')),
                      if (contract['original_pdf_path'] != null) OutlinedButton(
                        onPressed: () => _openPdf(contract['original_pdf_path'] as String), child: const Text('PDF original')),
                      if (contract['signed_pdf_path'] != null) OutlinedButton(
                        onPressed: () => _openPdf(contract['signed_pdf_path'] as String), child: const Text('PDF assinado')),
                      if (!terminal) TextButton(onPressed: _busy ? null : () => _cancel(contract), child: const Text('Cancelar')),
                    ]),
                  ],
                ),
              ));
            }),
        ]),
      ),
    );
  }
}
