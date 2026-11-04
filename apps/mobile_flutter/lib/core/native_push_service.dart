import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
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
  StreamSubscription<String>? _registeredSubscription;
  StreamSubscription<RemoteMessage>? _messageSubscription;
  StreamSubscription<RemoteMessage>? _openedSubscription;
  Completer<String>? _registrationCompleter;
  String? _companyId;
  String? _userId;
  String? _currentFid;
  bool _initialized = false;

  bool get isAndroid =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  Future<bool> registerIfAuthorized({
    required String companyId,
    required String userId,
  }) async {
    if (!isAndroid) return false;
    _companyId = companyId;
    _userId = userId;

    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp();
    }
    FirebaseMessaging.onBackgroundMessage(kidsLocFirebaseBackgroundHandler);
    final messaging = FirebaseMessaging.instance;
    final settings = await messaging.getNotificationSettings();
    final authorized =
        settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
    if (!authorized) return false;

    _listen(messaging);
    await _register(messaging);
    return _currentFid != null;
  }

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
    FirebaseMessaging.onBackgroundMessage(kidsLocFirebaseBackgroundHandler);

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
    await _register(messaging);
    return _currentFid != null;
  }

  Future<void> _register(FirebaseMessaging messaging) async {
    final completer = Completer<String>();
    _registrationCompleter = completer;
    try {
      await messaging.register();
      await completer.future.timeout(const Duration(seconds: 20));
    } finally {
      _registrationCompleter = null;
    }
  }

  void _listen(FirebaseMessaging messaging) {
    if (_initialized) return;
    _initialized = true;

    _registeredSubscription = messaging.onRegistered.listen((fid) {
      _saveToken(fid).then((_) {
        final completer = _registrationCompleter;
        if (completer != null && !completer.isCompleted) {
          completer.complete(fid);
        }
      }).catchError((Object error) {
        debugPrint('KidsLoc: falha ao registrar instalação FCM: $error');
        final completer = _registrationCompleter;
        if (completer != null && !completer.isCompleted) {
          completer.completeError(error);
        }
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

  Future<void> _saveToken(String fid) async {
    final companyId = _companyId;
    final userId = _userId;
    if (companyId == null || userId == null || fid.trim().isEmpty) return;

    final normalizedFid = fid.trim();
    final previousFid = _currentFid;
    _currentFid = normalizedFid;
    if (previousFid != null && previousFid != normalizedFid) {
      await _client
          .from('fcm_device_tokens')
          .delete()
          .eq('user_id', userId)
          .eq('token', previousFid);
    }

    await _client.from('fcm_device_tokens').upsert(
      {
        'company_id': companyId,
        'user_id': userId,
        'token': normalizedFid,
        'platform': 'android',
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      },
      onConflict: 'token',
    );
  }

  Future<void> unregisterCurrentDevice() async {
    final userId = _client.auth.currentUser?.id;
    final fid = _currentFid;
    if (userId != null && fid != null) {
      try {
        await _client
            .from('fcm_device_tokens')
            .delete()
            .eq('user_id', userId)
            .eq('token', fid);
      } catch (error) {
        debugPrint('KidsLoc: não foi possível remover o registro FCM: $error');
      }
    }

    try {
      if (Firebase.apps.isNotEmpty) {
        await FirebaseMessaging.instance.unregister();
      }
    } catch (error) {
      debugPrint('KidsLoc: não foi possível cancelar o registro FCM: $error');
    }

    await _registeredSubscription?.cancel();
    await _messageSubscription?.cancel();
    await _openedSubscription?.cancel();
    _registeredSubscription = null;
    _messageSubscription = null;
    _openedSubscription = null;
    _registrationCompleter = null;
    _currentFid = null;
    _initialized = false;
    _companyId = null;
    _userId = null;
  }
}
