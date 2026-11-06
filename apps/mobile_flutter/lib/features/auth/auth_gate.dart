import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../home/company_home_page.dart';
import 'kidsloc_update_service.dart';

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  static const _installer = MethodChannel('br.com.sonhokids.kidsloc/apk_installer');
  final _updates = KidsLocUpdateService();
  KidsLocRelease? _release;
  bool _checking = false;
  bool _downloading = false;
  double _progress = 0;
  String? _error;
  bool _dialogOpen = false;
  StateSetter? _dialogSetState;

  void _refreshDialog() => _dialogSetState?.call(() {});

  @override
  void initState() {
    super.initState();
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        Future<void>.delayed(const Duration(seconds: 3), _checkForUpdates);
      });
    }
  }

  Future<void> _checkForUpdates() async {
    if (!mounted || _checking) return;
    setState(() => _checking = true);
    try {
      final release = await _updates.checkForUpdate();
      if (!mounted || release == null) return;
      _release = release;
      await _showUpdateDialog();
    } catch (error) {
      debugPrint('KidsLoc updater: $error');
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  Future<void> _showUpdateDialog() async {
    if (!mounted || _dialogOpen || _release == null) return;
    _dialogOpen = true;
    await showDialog<void>(
      context: context,
      barrierDismissible: !_downloading,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, dialogSetState) {
          _dialogSetState = dialogSetState;
          return PopScope(
        canPop: !_downloading,
        child: AlertDialog(
          icon: const Icon(Icons.system_update_alt_rounded, color: Color(0xFF218653), size: 34),
          title: Text('KidsLoc ${_release!.version} disponível'),
          content: SizedBox(
            width: 360,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Uma nova versão do aplicativo está pronta. Atualize para continuar usando as melhorias mais recentes.'),
                if (_release!.notes.trim().isNotEmpty) ...[
                  const SizedBox(height: 12),
                  const Text('Novidades', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 5),
                  Text(_release!.notes, maxLines: 7, overflow: TextOverflow.ellipsis),
                ],
                if (_downloading) ...[
                  const SizedBox(height: 18),
                  LinearProgressIndicator(value: _progress > 0 ? _progress : null),
                  const SizedBox(height: 7),
                  Text(_progress > 0 ? 'Baixando ${(_progress * 100).round()}%' : 'Preparando download...'),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: Colors.red)),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: _downloading ? null : () => Navigator.of(dialogContext).pop(),
              child: const Text('Mais tarde'),
            ),
            FilledButton.icon(
              onPressed: _downloading ? null : _downloadAndInstall,
              icon: const Icon(Icons.download_rounded),
              label: const Text('Atualizar agora'),
            ),
          ],
        ),
      );
        },
      ),
    );
    _dialogSetState = null;
    _dialogOpen = false;
  }

  Future<void> _downloadAndInstall() async {
    final release = _release;
    if (release == null || !mounted) return;
    setState(() { _downloading = true; _progress = 0; _error = null; });
    _refreshDialog();
    try {
      final apk = await _updates.downloadApk(
        release,
        onProgress: (value) {
          if (mounted) {
            setState(() => _progress = value);
            _refreshDialog();
          }
        },
      );
      if (!mounted) return;
      final installed = await _installer.invokeMethod<bool>('installApk', {'path': apk.path});
      if (installed != true && mounted) {
        setState(() {
          _error = 'O Android abriu a autorização para instalar apps desta origem. Permita a instalação e toque em “Atualizar agora” novamente.';
          _downloading = false;
        });
        _refreshDialog();
        return;
      }
    } on PlatformException catch (error) {
      if (mounted) {
        setState(() => _error = error.message ?? 'O Android não conseguiu iniciar a instalação.');
        _refreshDialog();
      }
    } catch (error) {
      if (mounted) {
        setState(() => _error = 'Não foi possível atualizar: $error');
        _refreshDialog();
      }
    } finally {
      if (mounted && _downloading) {
        setState(() => _downloading = false);
        _refreshDialog();
      }
    }
  }

  @override
  Widget build(BuildContext context) => const CompanyHomePage();
}
