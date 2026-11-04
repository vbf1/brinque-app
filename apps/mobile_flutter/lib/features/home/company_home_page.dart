import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../customers/customers_page.dart';
import '../products/products_page.dart';
import '../rentals/rentals_page.dart';
import '../finance/finance_page.dart';
import '../occurrences/occurrences_page.dart';
import '../team_chat/team_chat_page.dart';
import '../../core/native_push_service.dart';
import '../reminders/reminder_settings_page.dart';
import '../contracts/contracts_page.dart';

class CompanyHomePage extends StatefulWidget {
  const CompanyHomePage({super.key});
  @override
  State<CompanyHomePage> createState() => _CompanyHomePageState();
}

class _CompanyHomePageState extends State<CompanyHomePage> {
  late final Future<Map<String, dynamic>> _companyFuture = _loadCompany();
  final _pushService = NativePushService();
  bool _pushBusy = false;
  String _pushStatus = 'Ative os avisos para receber lembretes neste aparelho.';

  @override
  void initState() {
    super.initState();
    _companyFuture.then((data) async {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) return;
      try {
        final enabled = await _pushService.registerIfAuthorized(
          companyId: data['id'] as String,
          userId: user.id,
        );
        if (enabled && mounted) {
          setState(() => _pushStatus = 'Notificações ativadas neste aparelho.');
        }
      } catch (error) {
        debugPrint('KidsLoc: não foi possível restaurar o registro de notificações: $error');
      }
    }).catchError((Object _) {});
  }

  Future<Map<String, dynamic>> _loadCompany() async {
    final client = Supabase.instance.client;
    final user = client.auth.currentUser;
    if (user == null) {
      throw Exception('Sua sessão expirou. Entre novamente.');
    }
    final member = await client.from('company_members').select('company_id, role')
      .eq('user_id', user.id).limit(1).maybeSingle().timeout(
        const Duration(seconds: 15),
        onTimeout: () => throw TimeoutException('A consulta da sua empresa demorou demais. Verifique sua conexão e tente novamente.'),
      );
    if (member == null) {
      throw Exception('Esta conta ainda não está vinculada a uma empresa. Peça ao proprietário para conferir seu acesso.');
    }
    final company = await client.from('companies').select('id, name, logo_url, home_image_url')
      .eq('id', member['company_id']).single().timeout(
        const Duration(seconds: 15),
        onTimeout: () => throw TimeoutException('Os dados da empresa demoraram demais para carregar. Verifique sua conexão.'),
      );
    return {'id': company['id'], 'name': company['name'], 'role': member['role'], 'email': user.email ?? ''};
  }

  Future<void> _enableNotifications(Map<String, dynamic> data) async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) return;
    setState(() { _pushBusy = true; _pushStatus = 'Solicitando permissão do Android...'; });
    try {
      final enabled = await _pushService.requestAndRegister(
        companyId: data['id'] as String,
        userId: user.id,
      );
      if (!mounted) return;
      setState(() => _pushStatus = enabled
          ? 'Notificações ativadas neste aparelho.'
          : 'Permissão não concedida. Você pode ativá-la nas configurações do Android.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _pushStatus = 'Não foi possível ativar: $error');
    } finally {
      if (mounted) setState(() => _pushBusy = false);
    }
  }

  Future<void> _testNotifications(Map<String, dynamic> data) async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) return;
    setState(() {
      _pushBusy = true;
      _pushStatus = 'Preparando o envio da notificação de teste...';
    });
    try {
      var enabled = await _pushService.registerIfAuthorized(
        companyId: data['id'] as String,
        userId: user.id,
      );
      if (!enabled) {
        enabled = await _pushService.requestAndRegister(
          companyId: data['id'] as String,
          userId: user.id,
        );
      }
      if (!enabled) {
        throw Exception('Ative a permissão de notificações do KidsLoc nas configurações do Android e tente novamente.');
      }

      if (mounted) {
        setState(() => _pushStatus = 'Enviando uma notificação real para este aparelho...');
      }
      final result = await _pushService.sendTestNotification(
        companyId: data['id'] as String,
      );
      final sent = (result['fcmSent'] as num?)?.toInt() ??
          (result['sent'] as num?)?.toInt() ?? 0;
      final total = (result['total'] as num?)?.toInt() ?? 0;
      if (!mounted) return;
      if (sent > 0) {
        setState(() => _pushStatus =
            'Notificação enviada ($sent de $total dispositivo(s)). Confira a central de notificações do Android.');
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Notificação de teste enviada para este aparelho.')),
        );
      } else if (result['fcmConfigured'] == false) {
        throw Exception('O Firebase ainda não está configurado no servidor para enviar notificações push.');
      } else if (total == 0) {
        throw Exception('Nenhum aparelho está registrado para receber notificações. Tente ativar as notificações novamente.');
      } else {
        throw Exception('O servidor não conseguiu entregar a notificação. Verifique a conexão e tente novamente.');
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _pushStatus = 'Falha no teste: ${error.toString().replaceFirst('Exception: ', '')}');
    } finally {
      if (mounted) setState(() => _pushBusy = false);
    }
  }

  Future<void> _logout() async {
    await _pushService.unregisterCurrentDevice();
    await Supabase.instance.client.auth.signOut();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('KidsLoc App'), actions: [
        IconButton(tooltip: 'Sair', onPressed: _logout, icon: const Icon(Icons.logout_rounded)),
      ]),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _companyFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.business_outlined, size: 48),
                const SizedBox(height: 16),
                Text(snapshot.error.toString().replaceFirst('Exception: ', ''), textAlign: TextAlign.center),
                const SizedBox(height: 16),
                FilledButton.tonal(onPressed: _logout, child: const Text('Sair')),
              ]),
            ));
          }
          final data = snapshot.data!;
          return Center(child: Padding(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 480), child: Card(
              child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.verified_user_outlined, size: 56, color: Theme.of(context).colorScheme.primary),
                const SizedBox(height: 16),
                Text('Sessão autenticada', style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 12),
                Text(data['email'] as String),
                const SizedBox(height: 8),
                Text(data['name'] as String, style: Theme.of(context).textTheme.titleLarge),
                Text('Perfil: ${data['role']}'),
                const SizedBox(height: 18),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Icon(Icons.notifications_active_outlined, color: Theme.of(context).colorScheme.primary),
                        const SizedBox(width: 8),
                        Expanded(child: Text('Notificações e lembretes', style: Theme.of(context).textTheme.titleMedium)),
                      ]),
                      const SizedBox(height: 8),
                      Text(_pushStatus, style: Theme.of(context).textTheme.bodySmall),
                      const SizedBox(height: 10),
                      SizedBox(width: double.infinity, child: FilledButton.tonalIcon(
                        onPressed: _pushBusy ? null : () => _enableNotifications(data),
                        icon: _pushBusy
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.notifications_outlined),
                        label: Text(_pushBusy ? 'Ativando...' : 'Ativar notificações neste aparelho'),
                      )),
                      if (data['role'] == 'owner' || data['role'] == 'admin') ...[
                        const SizedBox(height: 8),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: _pushBusy ? null : () => _testNotifications(data),
                            icon: const Icon(Icons.send_outlined),
                            label: const Text('Testar notificações'),
                          ),
                        ),
                      ],
                    ]),
                  ),
                ),
                if (data['role'] == 'owner' || data['role'] == 'admin') ...[
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => ReminderSettingsPage(
                            companyId: data['id'] as String,
                            role: data['role'] as String,
                          ),
                        ),
                      ),
                      icon: const Icon(Icons.notifications_active_outlined),
                      label: const Text('Configurar lembretes das locações'),
                    ),
                  ),
                ],
                const SizedBox(height: 20),
                const Text('Acesse os primeiros módulos da migração.', textAlign: TextAlign.center),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => CustomersPage(companyId: data['id'] as String),
                      ),
                    ),
                    icon: const Icon(Icons.people_alt_outlined),
                    label: const Text('Gerenciar clientes'),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => ProductsPage(companyId: data['id'] as String),
                      ),
                    ),
                    icon: const Icon(Icons.toys_outlined),
                    label: const Text('Brinquedos e estoque'),
                  ),
                ),
                if (data['role'] == 'owner' || data['role'] == 'admin') ...[
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => FinancePage(companyId: data['id'] as String),
                        ),
                      ),
                      icon: const Icon(Icons.account_balance_wallet_outlined),
                      label: const Text('Financeiro'),
                    ),
                  ),
                ],
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.tonalIcon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => RentalsPage(companyId: data['id'] as String),
                      ),
                    ),
                    icon: const Icon(Icons.event_note_outlined),
                    label: const Text('Gerenciar locações'),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => ContractsPage(
                          companyId: data['id'] as String,
                          companyName: data['name'] as String,
                        ),
                      ),
                    ),
                    icon: const Icon(Icons.description_outlined),
                    label: const Text('Contratos de locação'),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.tonalIcon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => TeamChatPage(companyId: data['id'] as String),
                      ),
                    ),
                    icon: const Icon(Icons.chat_bubble_outline),
                    label: const Text('Mensagens da equipe'),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => OccurrencesPage(
                          companyId: data['id'] as String,
                          role: data['role'] as String,
                        ),
                      ),
                    ),
                    icon: const Icon(Icons.report_problem_outlined),
                    label: const Text('Ocorrências'),
                  ),
                ),
              ])),
            )),
          ));
        },
      ),
    );
  }
}
