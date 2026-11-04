import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/app_messenger.dart';
import 'core/native_push_service.dart';
import 'core/supabase_config.dart';
import 'features/auth/auth_gate.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(kidsLocFirebaseBackgroundHandler);
    } catch (error) {
      debugPrint('KidsLoc: Firebase Messaging ainda não está disponível: $error');
    }
  }
  await Supabase.initialize(url: SupabaseConfig.url, publishableKey: SupabaseConfig.publishableKey);
  runApp(const KidsLocApp());
}

class KidsLocApp extends StatelessWidget {
  const KidsLocApp({super.key});
  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF218653);
    return MaterialApp(
      title: 'KidsLoc App',
      scaffoldMessengerKey: appMessengerKey,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: green),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF7F9F8),
        inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
      ),
      home: const AuthGate(),
    );
  }
}
