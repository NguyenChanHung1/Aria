import 'package:flutter_test/flutter_test.dart';

import 'package:aria_mobile/main.dart';

void main() {
  testWidgets('renders the input project creator', (WidgetTester tester) async {
    await tester.pumpWidget(const AriaApp());

    expect(find.text('Aria'), findsOneWidget);
    expect(find.text('Create an input project'), findsOneWidget);
    expect(find.text("What's your song about?"), findsOneWidget);
    expect(find.text('Create project'), findsOneWidget);
  });
}
