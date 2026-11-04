import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../data/company_data_repository.dart';

class CustomersPage extends StatefulWidget {
  const CustomersPage({super.key, required this.companyId});

  final String companyId;

  @override
  State<CustomersPage> createState() => _CustomersPageState();
}

class _CustomersPageState extends State<CustomersPage> {
  late final CompanyDataRepository _repository = CompanyDataRepository(
    client: Supabase.instance.client,
    companyId: widget.companyId,
  );
  late Future<List<Map<String, dynamic>>> _customersFuture =
      _repository.fetchCustomers();
  String _search = '';

  Future<void> _reload() async {
    setState(() {
      _customersFuture = _repository.fetchCustomers();
    });
  }

  Future<void> _editCustomer([Map<String, dynamic>? customer]) async {
    final name = TextEditingController(text: customer?['name'] as String? ?? '');
    final phone = TextEditingController(text: customer?['phone'] as String? ?? '');
    final email = TextEditingController(text: customer?['email'] as String? ?? '');
    final address = TextEditingController(text: customer?['address'] as String? ?? '');
    final notes = TextEditingController(text: customer?['notes'] as String? ?? '');
    final formKey = GlobalKey<FormState>();

    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(customer == null ? 'Novo cliente' : 'Editar cliente'),
        content: SizedBox(
          width: 420,
          child: Form(
            key: formKey,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(
                    controller: name,
                    decoration: const InputDecoration(labelText: 'Nome *'),
                    textCapitalization: TextCapitalization.words,
                    validator: (value) => value == null || value.trim().isEmpty
                        ? 'Informe o nome do cliente.'
                        : null,
                  ),
                  TextFormField(controller: phone, decoration: const InputDecoration(labelText: 'Telefone'), keyboardType: TextInputType.phone),
                  TextFormField(controller: email, decoration: const InputDecoration(labelText: 'E-mail'), keyboardType: TextInputType.emailAddress),
                  TextFormField(controller: address, decoration: const InputDecoration(labelText: 'Endereço')),
                  TextFormField(controller: notes, decoration: const InputDecoration(labelText: 'Observações'), maxLines: 2),
                ],
              ),
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
          FilledButton(
            onPressed: () {
              if (formKey.currentState!.validate()) {
                Navigator.pop(dialogContext, true);
              }
            },
            child: const Text('Salvar'),
          ),
        ],
      ),
    );

    if (saved == true && mounted) {
      try {
        await _repository.saveCustomer(
          customerId: customer?['id'] as String?,
          name: name.text,
          phone: phone.text,
          email: email.text,
          address: address.text,
          notes: notes.text,
        );
        await _reload();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Cliente salvo com sucesso.')),
          );
        }
      } catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Não foi possível salvar: $error')),
          );
        }
      }
    }

    name.dispose();
    phone.dispose();
    email.dispose();
    address.dispose();
    notes.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Clientes'),
        actions: [
          IconButton(
            tooltip: 'Atualizar',
            onPressed: _reload,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _editCustomer(),
        icon: const Icon(Icons.person_add_alt_1),
        label: const Text('Novo cliente'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: 'Buscar cliente por nome, telefone ou e-mail',
                border: OutlineInputBorder(),
              ),
              onChanged: (value) => setState(() => _search = value.trim().toLowerCase()),
            ),
          ),
          Expanded(
            child: FutureBuilder<List<Map<String, dynamic>>>(
              future: _customersFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.cloud_off_outlined, size: 40),
                          const SizedBox(height: 12),
                          Text('Não foi possível carregar os clientes. ${snapshot.error}', textAlign: TextAlign.center),
                          const SizedBox(height: 12),
                          OutlinedButton(onPressed: _reload, child: const Text('Tentar novamente')),
                        ],
                      ),
                    ),
                  );
                }
                final customers = (snapshot.data ?? []).where((customer) {
                  final haystack = [
                    customer['name'], customer['phone'], customer['email'],
                  ].whereType<String>().join(' ').toLowerCase();
                  return haystack.contains(_search);
                }).toList();

                if (customers.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        _search.isEmpty
                            ? 'Nenhum cliente cadastrado ainda.'
                            : 'Nenhum cliente encontrado para essa busca.',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  );
                }

                return RefreshIndicator(
                  onRefresh: _reload,
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                    itemCount: customers.length,
                    separatorBuilder: (_, index) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final customer = customers[index];
                      final customerName = customer['name'] as String? ?? 'Cliente';
                      final phoneValue = customer['phone'] as String?;
                      final emailValue = customer['email'] as String?;
                      return Card(
                        child: ListTile(
                          leading: CircleAvatar(
                            child: Text(customerName.isEmpty ? '?' : customerName.substring(0, 1).toUpperCase()),
                          ),
                          title: Text(customerName, maxLines: 1, overflow: TextOverflow.ellipsis),
                          subtitle: Text([
                            if (phoneValue != null && phoneValue.isNotEmpty) phoneValue,
                            if (emailValue != null && emailValue.isNotEmpty) emailValue,
                          ].join(' • ').isEmpty ? 'Sem telefone ou e-mail' : [
                            if (phoneValue != null && phoneValue.isNotEmpty) phoneValue,
                            if (emailValue != null && emailValue.isNotEmpty) emailValue,
                          ].join(' • ')),
                          trailing: IconButton(
                            tooltip: 'Editar cliente',
                            onPressed: () => _editCustomer(customer),
                            icon: const Icon(Icons.edit_outlined),
                          ),
                          onTap: () => _editCustomer(customer),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
