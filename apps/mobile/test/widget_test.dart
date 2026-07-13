import 'package:flutter_test/flutter_test.dart';

import 'package:aria_mobile/main.dart';

void main() {
  testWidgets('renders the song creator', (WidgetTester tester) async {
    await tester.pumpWidget(const AriaApp());

    expect(find.text('Aria'), findsOneWidget);
    expect(find.text('Describe your song'), findsOneWidget);
    expect(find.text("What's your song about?"), findsOneWidget);
    expect(find.byTooltip('Settings'), findsOneWidget);
  });
}
