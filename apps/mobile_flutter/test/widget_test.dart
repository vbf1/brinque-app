import 'package:flutter_test/flutter_test.dart';
import 'package:kidsloc_mobile/main.dart';

void main() {
  testWidgets('exibe a tela inicial da base de migração', (tester) async {
    await tester.pumpWidget(const KidsLocApp());
    expect(find.text('KidsLoc App'), findsOneWidget);
    expect(find.text('Nova base mobile preparada'), findsOneWidget);
    expect(find.textContaining('Ambiente de migração'), findsOneWidget);
  });
}
