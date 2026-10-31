import 'package:chapega_studio/main.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('shows the Chapega.com wordmark', (tester) async {
    await tester.pumpWidget(const ChapegaStudioApp());
    expect(find.bySemanticsLabel('Chapega.com'), findsOneWidget);
  });
}
