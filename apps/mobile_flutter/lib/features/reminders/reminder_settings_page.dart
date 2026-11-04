import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ReminderSettingsPage extends StatefulWidget {
  const ReminderSettingsPage({
    super.key,
    required this.companyId,
    required this.role,
  });

  final String companyId;
  final String role;

  @override
  State<ReminderSettingsPage> createState() => _ReminderSettingsPageState();
}

class _ReminderSettingsPageState extends State<ReminderSettingsPage> {
  final _client = Supabase.instance.client;
  bool _enabled = false;
  int _daysBefore = 3;
  int _frequency = 1;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  bool get _canManage => widget.role == 'owner' || widget.role == 'admin';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final row = await _client
          .from('company_event_reminder_settings')
          .select('enabled, days_before, notifications_per_day')
          .eq('company_id', widget.companyId)
          .maybeSingle();
      if (row != null) {
        _enabled = row['enabled'] as bool? ?? false;
        _daysBefore = row['days_before'] as int? ?? 3;
        _frequency = row['notifications_per_day'] as int? ?? 1;
      }
    } catch (error) {
      _error = 'Não foi possível carregar as configurações: $error';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    if (!_canManage) return;
    setState(() { _saving = true; _error = null; });
    try {
      await _client.from('company_event_reminder_settings').upsert({
        'company_id': widget.companyId,
        'enabled': _enabled,
        'days_before': _daysBefore,
        'notifications_per_day': _frequency,
        'updated_by': _client.auth.currentUser?.id,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      }, onConflict: 'company_id');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Configuração geral de lembretes salva.')),
      );
    } catch (error) {
      if (mounted) setState(() => _error = 'Não foi possível salvar: $error');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_canManage) {
      return Scaffold(
        appBar: AppBar(title: const Text('Lembretes')),
        body: const Center(child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('Somente proprietário e administradores podem alterar os lembretes gerais.', textAlign: TextAlign.center),
        )),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Lembretes de locações'),
        actions: [IconButton(tooltip: 'Atualizar', onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh))],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(padding: const EdgeInsets.all(16), children: [
              Card(child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _enabled,
                    title: const Text('Ativar lembretes gerais'),
                    subtitle: const Text('Aplica-se às locações que não tenham uma configuração própria.'),
                    onChanged: (value) => setState(() => _enabled = value),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<int>(
                    initialValue: _daysBefore,
                    decoration: const InputDecoration(labelText: 'Avisar quantos dias antes?'),
                    items: List.generate(30, (index) => index + 1)
                        .map((value) => DropdownMenuItem(value: value, child: Text('$value dia(s) antes')))
                        .toList(),
                    onChanged: (value) => setState(() => _daysBefore = value ?? _daysBefore),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<int>(
                    initialValue: _frequency,
                    decoration: const InputDecoration(labelText: 'Quantos avisos por dia?'),
                    items: List.generate(4, (index) => index + 1)
                        .map((value) => DropdownMenuItem(value: value, child: Text('$value aviso(s) por dia')))
                        .toList(),
                    onChanged: (value) => setState(() => _frequency = value ?? _frequency),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Os avisos são distribuídos ao longo do dia, no horário de Brasília. '
                    'A entrega depende de o funcionário ter ativado as notificações no aparelho.',
                    style: TextStyle(fontSize: 12),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  ],
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: _saving ? null : _save,
                    icon: _saving
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.save_outlined),
                    label: Text(_saving ? 'Salvando...' : 'Salvar configuração'),
                  ),
                ]),
              )),
            ]),
    );
  }
}
