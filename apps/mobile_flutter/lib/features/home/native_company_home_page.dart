import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/app_messenger.dart';
import '../../core/native_push_service.dart';

import '../agenda/agenda_page.dart';
import '../contracts/contracts_page.dart';
import '../customers/customers_page.dart';
import '../finance/finance_page.dart';
import '../marketing/marketing_page.dart';
import '../occurrences/occurrences_page.dart';
import '../products/products_page.dart';
import '../quotes/quotes_page.dart';
import '../reminders/reminder_settings_page.dart';
import '../rentals/rentals_page.dart';
import '../services/services_page.dart';
import '../statistics/statistics_page.dart';
import '../team_chat/team_chat_page.dart';
import '../users/users_page.dart';

class NativeCompanyHomePage extends StatefulWidget {
  const NativeCompanyHomePage({super.key});

  @override
  State<NativeCompanyHomePage> createState() => _NativeCompanyHomePageState();
}

class _NativeCompanyHomePageState extends State<NativeCompanyHomePage> {
  final _pushService = NativePushService();
  String? _registeredUserId;
  late Future<_CompanyContext> _future = _loadCompany();

  Future<_CompanyContext> _loadCompany() async {
    final client = Supabase.instance.client;
    final user = client.auth.currentUser;
    if (user == null) throw StateError('Sua sessão expirou. Entre novamente.');
    final member = await client.from('company_members')
        .select('company_id, role')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
    if (member == null) throw StateError('Esta conta ainda não está vinculada a uma empresa.');
    final company = await client.from('companies')
        .select('id, name')
        .eq('id', member['company_id'])
        .single();
    return _CompanyContext(
      id: company['id'] as String,
      name: company['name'] as String? ?? 'Minha empresa',
      role: member['role'] as String? ?? 'staff',
      userLabel: user.userMetadata?['full_name']?.toString() ??
          user.email?.split('@').first ?? 'Bem-vindo',
    );
  }

  bool _isAdmin(_CompanyContext company) =>
      company.role == 'owner' || company.role == 'admin';

  void _open(BuildContext context, _CompanyContext company, String page, {bool closeDrawer = false}) {
    final Widget? destination = switch (page) {
      'agenda' => AgendaPage(
        companyId: company.id,
        onOpenRentals: () => Navigator.of(context).push(
          MaterialPageRoute<void>(builder: (_) => RentalsPage(companyId: company.id)),
        ),
      ),
      'statistics' => StatisticsPage(companyId: company.id),
      'rentals' => RentalsPage(companyId: company.id),
      'contracts' => ContractsPage(companyId: company.id, companyName: company.name),
      'customers' => CustomersPage(companyId: company.id),
      'products' => ProductsPage(companyId: company.id),
      'services' => ServicesPage(companyId: company.id),
      'quotes' => QuotesPage(companyId: company.id),
      'finance' => FinancePage(companyId: company.id),
      'marketing' => MarketingPage(companyId: company.id, userId: Supabase.instance.client.auth.currentUser!.id),
      'chat' => TeamChatPage(companyId: company.id),
      'occurrences' => OccurrencesPage(companyId: company.id, role: company.role),
      'users' => UsersPage(companyId: company.id, viewerRole: company.role),
      'reminders' => ReminderSettingsPage(companyId: company.id, role: company.role),
      _ => null,
    };
    if (destination == null) return;
    if (closeDrawer) Navigator.of(context).pop();
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => destination));
  }

  Future<void> _ensurePushRegistered(_CompanyContext company) async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null || _registeredUserId == user.id) return;
    _registeredUserId = user.id;
    try {
      final enabled = await _pushService.registerIfAuthorized(
        companyId: company.id,
        userId: user.id,
      );
      if (!mounted || enabled) return;
      appMessengerKey.currentState?.showSnackBar(SnackBar(
        content: const Text('Ative as notificações para receber avisos do KidsLoc.'),
        action: SnackBarAction(
          label: 'Ativar',
          onPressed: () => _requestPushPermission(company.id, user.id),
        ),
        duration: const Duration(seconds: 8),
      ));
    } catch (error) {
      debugPrint('KidsLoc: falha ao preparar notificações nativas: $error');
    }
  }

  Future<void> _requestPushPermission(String companyId, String userId) async {
    try {
      final enabled = await _pushService.requestAndRegister(
        companyId: companyId,
        userId: userId,
      );
      appMessengerKey.currentState?.showSnackBar(SnackBar(
        content: Text(enabled
            ? 'Notificações ativadas neste aparelho.'
            : 'Permissão não concedida. Ative nas configurações do Android.'),
      ));
    } catch (error) {
      appMessengerKey.currentState?.showSnackBar(
        SnackBar(content: Text('Não foi possível ativar as notificações: $error')),
      );
    }
  }

  Future<void> _signOut() async {
    try {
      await _pushService.unregisterCurrentDevice();
    } catch (error) {
      debugPrint('KidsLoc: não foi possível remover o registro de notificações: $error');
    }
    _registeredUserId = null;
    await Supabase.instance.client.auth.signOut(scope: SignOutScope.local);
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<_CompanyContext>(
    future: _future,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      }
      if (snapshot.hasError) {
        return Scaffold(
          body: Center(child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.error_outline, size: 42),
              const SizedBox(height: 12),
              Text('Não foi possível carregar a empresa. ${snapshot.error}', textAlign: TextAlign.center),
              const SizedBox(height: 14),
              FilledButton(onPressed: () => setState(() => _future = _loadCompany()), child: const Text('Tentar novamente')),
            ]),
          )),
        );
      }
      final company = snapshot.data!;
      WidgetsBinding.instance.addPostFrameCallback((_) => _ensurePushRegistered(company));
      final admin = _isAdmin(company);
      final pages = <_HomePage>[
        _HomePage('agenda', 'Agenda', 'Calendário e reservas por dia', Icons.calendar_month_outlined),
        _HomePage('statistics', 'Estatísticas', 'Indicadores e histórico', Icons.bar_chart_outlined),
        _HomePage('rentals', 'Locações', 'Reservas e períodos', Icons.event_note_outlined),
        _HomePage('contracts', 'Contratos', 'Documentos e assinaturas', Icons.draw_outlined),
        _HomePage('customers', 'Clientes', 'Cadastro e histórico', Icons.people_outline),
        _HomePage('products', 'Estoque', 'Brinquedos e unidades', Icons.toys_outlined),
        _HomePage('services', 'Serviços', 'Serviços e preços', Icons.miscellaneous_services_outlined),
        _HomePage('quotes', 'Orçamentos', 'Propostas e PDFs', Icons.request_quote_outlined),
        if (admin) _HomePage('finance', 'Financeiro', 'Entradas e saídas', Icons.account_balance_wallet_outlined),
        if (admin) _HomePage('marketing', 'Marketing', 'Anúncios e divulgação', Icons.campaign_outlined),
        _HomePage('chat', 'Mensagens', 'Comunicação da equipe', Icons.chat_bubble_outline),
        _HomePage('occurrences', 'Ocorrências', 'Registros e fotos', Icons.report_gmailerrorred_outlined),
        if (admin) _HomePage('users', 'Usuários', 'Equipe e permissões', Icons.manage_accounts_outlined),
      ];
      return Scaffold(
        backgroundColor: const Color(0xFFF2F5FA),
        appBar: AppBar(
          toolbarHeight: 70,
          backgroundColor: const Color(0xFF172B4D),
          foregroundColor: Colors.white,
          titleSpacing: 0,
          title: Row(children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(11),
              child: Image.asset('assets/kidsloc-brand.webp', width: 44, height: 44, fit: BoxFit.contain),
            ),
            const SizedBox(width: 10),
            const Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              Text('KidsLoc App', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              Text('GESTÃO DE LOCAÇÕES', style: TextStyle(fontSize: 9, letterSpacing: 1.2, color: Color(0xFFC6D3E5))),
            ]),
          ]),
          actions: [
            PopupMenuButton<String>(
              tooltip: 'Configurações',
              icon: const Icon(Icons.more_vert),
              onSelected: (value) {
                if (value == 'reminders') _open(context, company, 'reminders');
                if (value == 'logout') _signOut();
              },
              itemBuilder: (_) => [
                if (admin) const PopupMenuItem(value: 'reminders', child: Text('Configurar lembretes')),
                const PopupMenuItem(value: 'logout', child: Text('Sair')),
              ],
            ),
          ],
        ),
        drawer: _buildDrawer(context, company, pages),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(15, 18, 15, 30),
          children: [
            Text('Olá, ${company.userLabel}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Color(0xFF172B4D))),
            const SizedBox(height: 4),
            Text(company.name, style: const TextStyle(fontSize: 12, color: Color(0xFF718096))),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(children: [
                  const Icon(Icons.verified_user_outlined, color: Color(0xFF16845B)),
                  const SizedBox(width: 10),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Acesso à empresa', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                    Text(admin ? 'Perfil administrador' : 'Perfil de equipe', style: const TextStyle(fontSize: 11, color: Color(0xFF718096))),
                  ])),
                  const Text('Ativo', style: TextStyle(fontSize: 10, color: Color(0xFF16845B), fontWeight: FontWeight.w800)),
                ]),
              ),
            ),
            const SizedBox(height: 12),
            const Text('Acesso rápido', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Color(0xFF172B4D))),
            const SizedBox(height: 12),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: pages.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 11,
                crossAxisSpacing: 11,
                childAspectRatio: 1.08,
              ),
              itemBuilder: (context, index) {
                final page = pages[index];
                return InkWell(
                  borderRadius: BorderRadius.circular(17),
                  onTap: () => _open(context, company, page.id, closeDrawer: true),
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(17),
                      border: Border.all(color: const Color(0xFFE3E9F2)),
                      boxShadow: const [BoxShadow(color: Color(0x0D172B4D), blurRadius: 12, offset: Offset(0, 3))],
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Container(
                        width: 39,
                        height: 39,
                        decoration: BoxDecoration(color: const Color(0xFFEAF1FF), borderRadius: BorderRadius.circular(12)),
                        child: Icon(page.icon, color: const Color(0xFF3478E5), size: 21),
                      ),
                      const Spacer(),
                      Text(page.title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Color(0xFF172B4D))),
                      const SizedBox(height: 4),
                      Text(page.description, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 10, color: Color(0xFF718096))),
                    ]),
                  ),
                );
              },
            ),
            const SizedBox(height: 18),
            const Center(child: Text('KIDSLOC APP · GESTÃO DE LOCAÇÕES', style: TextStyle(fontSize: 9, letterSpacing: 1, color: Color(0xFF718096)))),
          ],
        ),
      );
    },
  );

  Widget _buildDrawer(BuildContext context, _CompanyContext company, List<_HomePage> pages) {
    return Drawer(
      child: SafeArea(child: Column(children: [
        Container(
          width: double.infinity,
          color: const Color(0xFF172B4D),
          padding: const EdgeInsets.all(18),
          child: Row(children: [
            Image.asset('assets/kidsloc-brand.webp', width: 52, height: 52, fit: BoxFit.contain),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('KidsLoc App', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800)),
              Text(company.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Color(0xFFC6D3E5), fontSize: 11)),
            ])),
          ]),
        ),
        Expanded(child: ListView(
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            for (final page in pages)
              ListTile(
                leading: Icon(page.icon, color: const Color(0xFF3478E5)),
                title: Text(page.title),
                subtitle: Text(page.description, maxLines: 1, overflow: TextOverflow.ellipsis),
                onTap: () => _open(context, company, page.id, closeDrawer: true),
              ),
            if (_isAdmin(company))
              ListTile(
                leading: const Icon(Icons.notifications_active_outlined, color: Color(0xFF3478E5)),
                title: const Text('Lembretes'),
                onTap: () => _open(context, company, 'reminders', closeDrawer: true),
              ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.logout, color: Color(0xFFC94B4B)),
              title: const Text('Sair'),
              onTap: _signOut,
            ),
          ],
        )),
      ])),
    );
  }
}

class _CompanyContext {
  const _CompanyContext({required this.id, required this.name, required this.role, required this.userLabel});
  final String id;
  final String name;
  final String role;
  final String userLabel;
}

class _HomePage {
  const _HomePage(this.id, this.title, this.description, this.icon);
  final String id;
  final String title;
  final String description;
  final IconData icon;
}
