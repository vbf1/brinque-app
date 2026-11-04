import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class CompanyHomePage extends StatefulWidget {
  const CompanyHomePage({super.key});
  @override
  State<CompanyHomePage> createState() => _CompanyHomePageState();
}

class _CompanyHomePageState extends State<CompanyHomePage> {
  late final Future<Map<String, dynamic>> _companyFuture = _loadCompany();

  Future<Map<String, dynamic>> _loadCompany() async {
    final client = Supabase.instance.client;
    final user = client.auth.currentUser;
    if (user == null) {
      throw Exception('Sua sessão expirou. Entre novamente.');
    }
    final member = await client.from('company_members').select('company_id, role')
      .eq('user_id', user.id).limit(1).maybeSingle();
    if (member == null) throw Exception('Esta conta ainda não está vinculada a uma empresa. Peça ao proprietário para conferir seu acesso.');
    final company = await client.from('companies').select('id, name, logo_url, home_image_url')
      .eq('id', member['company_id']).single();
    return {'name': company['name'], 'role': member['role'], 'email': user.email ?? ''};
  }

  Future<void> _logout() async {
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
          if (snapshot.hasError) return Center(child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.business_outlined, size: 48),
              const SizedBox(height: 16),
              Text(snapshot.error.toString().replaceFirst('Exception: ', ''), textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton.tonal(onPressed: _logout, child: const Text('Sair')),
            ]),
          ));
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
                const SizedBox(height: 20),
                const Text('Esta é a primeira etapa da migração. Os módulos operacionais serão incorporados gradualmente.', textAlign: TextAlign.center),
              ])),
            )),
          ));
        },
      ),
    );
  }
}
