import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kidsloc_mobile/features/auth/login_page.dart';

void main() {
  testWidgets('mostra o formulário de login do KidsLoc', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: LoginPage()));
    expect(find.byWidgetPredicate((widget) => widget is Image && widget.image is AssetImage && (widget.image as AssetImage).assetName == 'assets/kidsloc-brand.webp'), findsOneWidget);
    expect(find.text('Entrar'), findsOneWidget);
    expect(find.text('Esqueci minha senha'), findsOneWidget);
  });
}
