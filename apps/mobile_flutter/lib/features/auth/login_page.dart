import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/supabase_config.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, this.passwordRecovery = false});
  final bool passwordRecovery;
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _newPassword = TextEditingController();
  final _confirmPassword = TextEditingController();
  bool _forgot = false;
  bool _busy = false;
  String _message = '';
  bool _isError = false;
  SupabaseClient get _client => Supabase.instance.client;

  @override
  void dispose() {
    _email.dispose(); _password.dispose(); _newPassword.dispose(); _confirmPassword.dispose();
    super.dispose();
  }

  void _feedback(String value, {bool error = false}) {
    if (!mounted) return;
    setState(() { _message = value; _isError = error; });
  }

  String _friendlyError(Object error) {
    final raw = error.toString().replaceFirst('Exception: ', '');
    final value = raw.toLowerCase();
    if (value.contains('invalid login credentials')) return 'E-mail ou senha incorretos.';
    if (value.contains('email not confirmed')) return 'Seu e-mail ainda não foi confirmado.';
    if (value.contains('otp_expired') || value.contains('expired')) return 'O link expirou ou já foi utilizado. Solicite outro.';
    return raw;
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _busy = true); _feedback('Validando seu acesso...');
    try {
      await _client.auth.signInWithPassword(email: _email.text.trim(), password: _password.text);
    } catch (error) { _feedback(_friendlyError(error), error: true); }
    finally { if (mounted) setState(() => _busy = false); }
  }

  Future<void> _requestReset() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _busy = true); _feedback('Solicitando o link de recuperação...');
    try {
      await _client.auth.resetPasswordForEmail(
        _email.text.trim(),
        redirectTo: kIsWeb ? null : SupabaseConfig.passwordRecoveryRedirect,
      );
      _feedback('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha. Confira também o spam.');
    } catch (error) { _feedback(_friendlyError(error), error: true); }
    finally { if (mounted) setState(() => _busy = false); }
  }

  Future<void> _updatePassword() async {
    if (!_formKey.currentState!.validate()) return;
    if (_newPassword.text != _confirmPassword.text) {
      _feedback('As senhas não são iguais. Confira e tente novamente.', error: true); return;
    }
    setState(() => _busy = true); _feedback('Atualizando sua senha...');
    try {
      await _client.auth.updateUser(UserAttributes(password: _newPassword.text));
      await _client.auth.signOut();
      _feedback('Senha definida com sucesso! Entre com a nova senha.');
    } catch (error) { _feedback(_friendlyError(error), error: true); }
    finally { if (mounted) setState(() => _busy = false); }
  }

  Widget _field(TextEditingController controller, String label, {bool email = false, bool password = false}) {
    return TextFormField(
      controller: controller,
      obscureText: password,
      keyboardType: email ? TextInputType.emailAddress : TextInputType.text,
      autocorrect: !email && !password,
      enableSuggestions: !password,
      decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
      validator: (value) {
        final text = value?.trim() ?? '';
        if (text.isEmpty) return 'Preencha este campo.';
        if (email && !text.contains('@')) return 'Informe um e-mail válido.';
        if (password && text.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
        return null;
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final recovery = widget.passwordRecovery;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.toys_rounded, size: 56, color: Theme.of(context).colorScheme.primary),
                        const SizedBox(height: 16),
                        Text(recovery ? 'Definir nova senha' : _forgot ? 'Recuperar senha' : 'KidsLoc App',
                          textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall),
                        const SizedBox(height: 8),
                        Text('SONHO KIDS BRINQUEDOS', textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.labelSmall?.copyWith(letterSpacing: 1.2)),
                        const SizedBox(height: 24),
                        if (recovery) ...[
                          _field(_newPassword, 'Nova senha', password: true),
                          const SizedBox(height: 12),
                          _field(_confirmPassword, 'Confirme a nova senha', password: true),
                          const SizedBox(height: 18),
                          FilledButton(onPressed: _busy ? null : _updatePassword, child: Text(_busy ? 'Salvando...' : 'Salvar nova senha')),
                        ] else ...[
                          _field(_email, 'E-mail', email: true),
                          if (!_forgot) ...[
                            const SizedBox(height: 12),
                            _field(_password, 'Senha', password: true),
                          ],
                          const SizedBox(height: 18),
                          FilledButton(
                            onPressed: _busy ? null : _forgot ? _requestReset : _login,
                            child: Text(_busy ? 'Aguarde...' : _forgot ? 'Enviar link de recuperação' : 'Entrar'),
                          ),
                          TextButton(
                            onPressed: _busy ? null : () => setState(() { _forgot = !_forgot; _message = ''; }),
                            child: Text(_forgot ? 'Voltar ao login' : 'Esqueci minha senha'),
                          ),
                        ],
                        if (_message.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          Text(_message, textAlign: TextAlign.center,
                            style: TextStyle(color: _isError ? Theme.of(context).colorScheme.error : Theme.of(context).colorScheme.onSurfaceVariant)),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
