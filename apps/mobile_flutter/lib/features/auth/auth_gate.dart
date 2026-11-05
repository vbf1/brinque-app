import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../home/company_home_page.dart';

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});
  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  StreamSubscription<AuthState>? _subscription;
  bool _passwordRecovery = false;

  @override
  void initState() {
    super.initState();
    _subscription = Supabase.instance.client.auth.onAuthStateChange.listen(
      (state) {
        if (!mounted) return;
        setState(() => _passwordRecovery = state.event == AuthChangeEvent.passwordRecovery);
      },
      onError: (Object error, StackTrace stackTrace) => debugPrint('Erro de autenticação: $error'),
    );
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return const CompanyHomePage();
  }
}
