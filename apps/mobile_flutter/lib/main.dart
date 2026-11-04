import 'package:flutter/material.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const KidsLocApp());
}

class KidsLocApp extends StatelessWidget {
  const KidsLocApp({super.key});

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF218653);
    return MaterialApp(
      title: 'KidsLoc App',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: green),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF7F9F8),
      ),
      home: const MigrationHomePage(),
    );
  }
}

class MigrationHomePage extends StatelessWidget {
  const MigrationHomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('KidsLoc App'),
        backgroundColor: Theme.of(context).colorScheme.surface,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.toys_rounded,
                    size: 64, color: Theme.of(context).colorScheme.primary),
                const SizedBox(height: 20),
                Text(
                  'Nova base mobile preparada',
                  style: Theme.of(context).textTheme.headlineSmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                Text(
                  'Esta é a estrutura inicial da migração para Flutter. '
                  'Os módulos serão incorporados gradualmente, mantendo '
                  'o backend e os dados atuais.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
                const SizedBox(height: 20),
                const Chip(
                  avatar: Icon(Icons.construction_outlined, size: 18),
                  label: Text('Ambiente de migração — não é a versão de produção'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
