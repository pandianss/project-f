import 'package:flutter_test/flutter_test.dart';
import 'package:farmos_app/main.dart';

void main() {
  testWidgets('App boots to registration screen', (tester) async {
    await tester.pumpWidget(const FarmosApp());
    expect(find.text('Register'), findsOneWidget);
  });
}
