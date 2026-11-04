import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app_messenger.dart';

@pragma('vm:entry-point')
Future<void> kidsLocFirebaseBackgroundHandler(RemoteMessage message) async {
  if (Firebase.apps.isEmpty) {
    await Firebase.initializeApp();
  }
}

class NativePushService {
  NativePushService({SupabaseClient? client})
      : _client = client ?? Supabase.instance.client;

  final SupabaseClient _client;
  StreamSubscription<String>? _tokenSubscription;
  StreamSubscription<RemoteMessage>? _messageSubscription;
  StreamSubscription<RemoteMessage>? _openedSubscription;
  String? _companyId;
  String? _userId;
  bool _initialized = false;

  bool get isAndroid =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  Future<bool> requestAndRegister({
    required String companyId,
    required String userId,
  }) async {
    if (!isAndroid) return false;

    _companyId = companyId;
    _userId = userId;

    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp();
    }
    FirebaseMessaging.onBackgroundMessage(
      kidsLocFirebaseBackgroundHandler,
    );

    final messaging = FirebaseMessaging.instance;
    final permission = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );
    final authorized =
        permission.authorizationStatus == AuthorizationStatus.authorized ||
        permission.authorizationStatus == AuthorizationStatus.provisional;
    if (!authorized) return false;

    _listen(messaging);
    final token = await messaging.getToken();
    if (token == null || token.trim().isEmpty) {
      throw StateError('O Firebase não retornou o token deste aparelho.');
    }
    await _saveToken(token);
    return true;
  }

  void _listen(FirebaseMessaging messaging) {
    if (_initialized) return;
    _initialized = true;

    _tokenSubscription = messaging.onTokenRefresh.listen((token) {
      _saveToken(token).catchError((Object error) {
        debugPrint('KidsLoc: falha ao atualizar token FCM: $error');
      });
    });

    _messageSubscription = FirebaseMessaging.onMessage.listen((message) {
      final title = message.notification?.title ?? 'KidsLoc App';
      final body = message.notification?.body ?? 'Você recebeu um aviso.';
      appMessengerKey.currentState?.showSnackBar(
        SnackBar(content: Text('$title: $body')),
      );
    });

    _openedSubscription =
        FirebaseMessaging.onMessageOpenedApp.listen((message) {
      final title = message.notification?.title ?? 'KidsLoc App';
      appMessengerKey.currentState?.showSnackBar(
        SnackBar(content: Text('$title — aviso aberto')),
      );
    });
  }

  Future<void> _saveToken(String token) async {
    final companyId = _companyId;
    final userId = _userId;
    if (companyId == null || userId == null || token.trim().isEmpty) return;

    final result = await _client.from('fcm_device_tokens').upsert(
      {
        'company_id': companyId,
        'user_id': userId,
        'token': token.trim(),
        'platform': 'android',
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      },
      onConflict: 'token',
    );
    if (result.error != null) throw result.error!;
  }

  Future<void> unregisterCurrentDevice() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) return;

    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && token.isNotEmpty) {
        await _client
            .from('fcm_device_tokens')
            .delete()
            .eq('user_id', userId)
            .eq('token', token);
      }
    } catch (error) {
      debugPrint('KidsLoc: não foi possível remover o token FCM: $error');
    }

    await _tokenSubscription?.cancel();
    await _messageSubscription?.cancel();
    await _openedSubscription?.cancel();
    _tokenSubscription = null;
    _messageSubscription = null;
    _openedSubscription = null;
    _initialized = false;
    _companyId = null;
    _userId = null;
  }
}
