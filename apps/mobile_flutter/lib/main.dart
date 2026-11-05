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
        colorScheme: ColorScheme.fromSeed(seedColor: green).copyWith(
          primary: const Color(0xFF218653),
          secondary: const Color(0xFFFFD34E),
          surface: Colors.white,
        ),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF5F7FA),
        cardTheme: CardThemeData(
          elevation: 0,
          color: Colors.white,
          surfaceTintColor: Colors.transparent,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22), side: const BorderSide(color: Color(0xFFE7ECF2))),
          margin: EdgeInsets.zero,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFFF8FAFC),
          contentPadding: const EdgeInsets.symmetric(horizontal: 15, vertical: 15),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFFE1E7EF))),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFFE1E7EF))),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFF218653), width: 1.6)),
          labelStyle: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF64748B)),
        ),
        dropdownButtonTheme: DropdownButtonThemeData(
          dropdownColor: Colors.white,
          borderRadius: BorderRadius.circular(18),
          elevation: 12,
          menuMaxHeight: 360,
          style: const TextStyle(color: Color(0xFF172B4D), fontSize: 14, fontWeight: FontWeight.w600),
        ),
        popupMenuTheme: PopupMenuThemeData(
          color: Colors.white,
          surfaceTintColor: Colors.transparent,
          elevation: 12,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: Color(0xFFE7ECF2))),
          textStyle: const TextStyle(color: Color(0xFF172B4D), fontSize: 14, fontWeight: FontWeight.w600),
        ),
        listTileTheme: const ListTileThemeData(minVerticalPadding: 10),
      ),
      home: const AuthGate(),
    );
  }
}
