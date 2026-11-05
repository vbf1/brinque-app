import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_messenger.dart';
import '../../core/native_push_service.dart';

class CompanyHomePage extends StatefulWidget {
  const CompanyHomePage({super.key});

  @override
  State<CompanyHomePage> createState() => _CompanyHomePageState();
}

class _CompanyHomePageState extends State<CompanyHomePage> {
  static const _webAppUrl = 'https://vbf1.github.io/kidsloc-app/';
  final _pushService = NativePushService();
  late final WebViewController _controller;
  bool _loading = true;
  bool _pageFailed = false;
  bool _syncingSession = false;
  String? _lastSyncedUserId;

  @override
  void initState() {
    super.initState();
    final nativeSession = Supabase.instance.client.auth.currentSession;
    final initialUri = Uri.parse(_webAppUrl);
    final launchUri = nativeSession == null
        ? initialUri
        : initialUri.replace(
            fragment: 'access_token=${Uri.encodeComponent(nativeSession.accessToken)}&refresh_token=${Uri.encodeComponent(nativeSession.refreshToken)}&token_type=bearer',
          );
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        'KidsLocNative',
        onMessageReceived: _handleWebMessage,
      )
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (request) {
          final uri = Uri.tryParse(request.url);
          if (uri == null) return NavigationDecision.navigate;
          final isAppHost = uri.host == 'vbf1.github.io' || uri.host.endsWith('.supabase.co');
          if (isAppHost) return NavigationDecision.navigate;
          if (uri.scheme == 'https' || uri.scheme == 'http' || uri.scheme == 'mailto' || uri.scheme == 'tel' || uri.scheme == 'whatsapp') {
            unawaited(launchUrl(uri, mode: LaunchMode.externalApplication).then((_) {}).catchError((_) {}));
            return NavigationDecision.prevent;
          }
          return NavigationDecision.navigate;
        },
        onPageStarted: (_) {
          if (mounted) setState(() { _loading = true; _pageFailed = false; });
        },
        onPageFinished: (_) {
          if (mounted) setState(() => _loading = false);
          _syncExistingNativeSession();
        },
        onWebResourceError: (error) {
          if (error.isForMainFrame == true && mounted) {
            setState(() { _loading = false; _pageFailed = true; });
          }
        },
      ))
      ..loadRequest(launchUri);
    _syncExistingNativeSession();
  }

  Future<void> _syncExistingNativeSession() async {
    final session = Supabase.instance.client.auth.currentSession;
    if (session == null || session.user.id == _lastSyncedUserId) return;
    await _registerPushForUser(session.user.id);
  }

  Future<void> _handleWebMessage(JavaScriptMessage message) async {
    if (_syncingSession) return;
    Map<String, dynamic> payload;
    try {
      final decoded = jsonDecode(message.message);
      if (decoded is! Map) return;
      payload = Map<String, dynamic>.from(decoded);
    } catch (_) {
      return;
    }

    final type = payload['type'];
    if (type == 'signed_out') {
      _lastSyncedUserId = null;
      await _pushService.unregisterCurrentDevice();
      await Supabase.instance.client.auth.signOut(scope: SignOutScope.local);
      return;
    }

    if (type != 'session') return;
    final accessToken = payload['access_token']?.toString();
    final refreshToken = payload['refresh_token']?.toString();
    if (accessToken == null || refreshToken == null || accessToken.isEmpty || refreshToken.isEmpty) return;

    _syncingSession = true;
    try {
      final result = await Supabase.instance.client.auth.setSession(
        refreshToken,
        accessToken: accessToken,
      );
      if (result.session == null) return;
      _lastSyncedUserId = result.session!.user.id;
      await _registerPushForUser(result.session!.user.id);
    } catch (error) {
      debugPrint('KidsLoc: não foi possível sincronizar a sessão web com o Android: $error');
    } finally {
      _syncingSession = false;
    }
  }

  Future<void> _registerPushForUser(String userId) async {
    try {
      final client = Supabase.instance.client;
      final member = await client.from('company_members')
          .select('company_id')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();
      if (member == null) return;
      final enabled = await _pushService.registerIfAuthorized(
        companyId: member['company_id'] as String,
        userId: userId,
      );
      if (!mounted) return;
      if (!enabled) {
        appMessengerKey.currentState?.showSnackBar(
          SnackBar(
            content: const Text('Ative as notificações para receber avisos do KidsLoc.'),
            action: SnackBarAction(
              label: 'Ativar',
              onPressed: () => _requestPushPermission(member['company_id'] as String, userId),
            ),
            duration: const Duration(seconds: 8),
          ),
        );
      }
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

  Future<void> _handleBack() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
    } else {
      await SystemNavigator.pop();
    }
  }

  @override
  void dispose() {
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) unawaited(_handleBack());
      },
      child: Scaffold(
        body: SafeArea(
          child: Stack(
            children: [
              WebViewWidget(controller: _controller),
              if (_loading)
                const Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: LinearProgressIndicator(minHeight: 2),
                ),
              if (_pageFailed)
                Positioned.fill(
                  child: ColoredBox(
                    color: Theme.of(context).scaffoldBackgroundColor,
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(28),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.wifi_off_rounded, size: 48),
                            const SizedBox(height: 14),
                            const Text(
                              'Não foi possível carregar o KidsLoc App.',
                              textAlign: TextAlign.center,
                              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'Verifique sua conexão e tente novamente.',
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 18),
                            FilledButton.icon(
                              onPressed: () => _controller.reload(),
                              icon: const Icon(Icons.refresh),
                              label: const Text('Tentar novamente'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
