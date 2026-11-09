import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ennodia_mobile/app.dart';
import 'package:ennodia_mobile/device_services.dart';
import 'package:ennodia_mobile/setup.dart';
import 'setup_test.dart' show MemoryStore;

void main() {
  testWidgets('discovery is honest about app detection and unavailable chat', (
    tester,
  ) async {
    await tester.pumpWidget(
      EnnodiaApp(
        setup: SetupCoordinator(MemoryStore(), []),
        discover: () async => [
          const AssistantAvailability(
            'Claude',
            true,
            'A connection is not available yet.',
          ),
        ],
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Find compatible assistants'));
    await tester.pumpAndSettle();
    expect(find.text('Detected'), findsOneWidget);
    expect(find.text('Connected'), findsNothing);
    expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'stop during discovery ignores results and does not restart setup',
    (tester) async {
      final result = Completer<List<AssistantAvailability>>();
      final setup = SetupCoordinator(MemoryStore(), []);
      await tester.pumpWidget(
        EnnodiaApp(setup: setup, discover: () => result.future),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Find compatible assistants'));
      await tester.pump();
      await tester.tap(find.text('Stop'));
      await tester.pump();
      result.complete([
        const AssistantAvailability('Claude', true, 'Detected'),
      ]);
      await tester.pumpAndSettle();
      expect(find.text('Setup stopped.'), findsOneWidget);
      expect(find.text('Claude'), findsNothing);
      expect(setup.phase, 'idle');
    },
  );
}
