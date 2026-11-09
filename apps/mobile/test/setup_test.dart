import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:ennodia_mobile/setup.dart';

class MemoryStore implements JournalStore {
  String? value;
  bool fail = false;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String value) async {
    if (fail) throw StateError('Storage locked');
    this.value = value;
  }
}

class FakeAdapter implements SetupAdapter {
  FakeAdapter(
    this.id,
    this.log, {
    this.reversibility = Reversibility.automatic,
  });
  @override
  final String id;
  final List<String> log;
  @override
  final Reversibility reversibility;
  bool existing = false, approved = true, works = true, undoWorks = true;
  bool applied = false;
  Completer<bool>? authorization;
  void Function()? onAuthorize;
  @override
  Future<Map<String, dynamic>> snapshot() async => {'existing': existing};
  @override
  bool alreadyConnected(Map<String, dynamic> before) =>
      before['existing'] == true;
  @override
  Future<bool> authorize(Change change, Cancellation cancellation) async {
    log.add('authorize:$id');
    onAuthorize?.call();
    return authorization == null ? approved : await authorization!.future;
  }

  @override
  Future<void> apply(Change change, Cancellation cancellation) async {
    cancellation.check();
    log.add('apply:$id');
    applied = true;
  }

  @override
  Future<bool> verify(Change change) async => works;
  @override
  Future<void> undo(Change change) async {
    log.add('undo:$id');
    if (!undoWorks) throw StateError('Offline');
    applied = false;
  }

  @override
  Future<bool> restored(Change change) async => !applied;
}

void main() {
  test(
    'undo intent is durable while an external authorization is outstanding',
    () async {
      final store = MemoryStore();
      final entered = Completer<void>();
      final a = FakeAdapter('a', []);
      final b = FakeAdapter('b', [])
        ..authorization = Completer<bool>()
        ..onAuthorize = () => entered.complete();
      final setup = SetupCoordinator(store, [a, b]);
      await setup.initialize();
      final running = setup.start();
      await entered.future;
      final undoing = setup.undo();
      await Future<void>.delayed(Duration.zero);
      expect(jsonDecode(store.value!)['phase'], 'undoing');
      b.authorization!.complete(true);
      await running;
      await undoing;
      expect(a.applied, isFalse);
      expect(setup.needsRestoration, isFalse);
    },
  );
  test(
    'failed repair retains Stop/keep semantics across another restart',
    () async {
      final store = MemoryStore()
        ..value = jsonEncode({
          'version': 1,
          'phase': 'stopped',
          'changes': [
            Change('s:a', 'a', {}, state: 'connected').toJson(),
            Change('s:b', 'b', {}).toJson(),
          ],
        });
      final a = FakeAdapter('a', [])..applied = true;
      final b = FakeAdapter('b', [])
        ..applied = true
        ..undoWorks = false;
      await SetupCoordinator(store, [a, b]).initialize();
      expect(jsonDecode(store.value!)['phase'], 'repairing');
      b.undoWorks = true;
      await SetupCoordinator(store, [a, b]).initialize();
      expect(a.applied, isTrue);
      expect(b.applied, isFalse);
    },
  );

  test('immediate stop cannot be lost before the setup task starts', () async {
    final log = <String>[];
    final setup = SetupCoordinator(MemoryStore(), [FakeAdapter('a', log)]);
    await setup.initialize();
    final running = setup.start();
    final stopping = setup.stop();
    await running;
    await stopping;
    expect(log, isEmpty);
    expect(setup.phase, 'stopped');
  });
  test('failed compensation prevents subsequent setup operations', () async {
    final log = <String>[];
    final setup = SetupCoordinator(MemoryStore(), [
      FakeAdapter('a', log)
        ..approved = false
        ..undoWorks = false,
      FakeAdapter('b', log),
    ]);
    await setup.initialize();
    await setup.start();
    expect(setup.phase, 'attention');
    expect(log, ['authorize:a', 'undo:a']);
  });
  test(
    'interrupted repair of a stopped session preserves verified connections',
    () async {
      final store = MemoryStore()
        ..value = jsonEncode({
          'version': 1,
          'phase': 'repairing',
          'changes': [
            Change('s:a', 'a', {}, state: 'connected').toJson(),
            Change('s:b', 'b', {}).toJson(),
          ],
        });
      final log = <String>[];
      final a = FakeAdapter('a', log)..applied = true;
      final b = FakeAdapter('b', log)..applied = true;
      final setup = SetupCoordinator(store, [a, b]);
      await setup.initialize();
      expect(log, ['undo:b']);
      expect(a.applied, isTrue);
      expect(b.applied, isFalse);
    },
  );
  test(
    'writes intent before authorization; verifies and undoes in reverse order',
    () async {
      final store = MemoryStore();
      final log = <String>[];
      final a = FakeAdapter('a', log), b = FakeAdapter('b', log);
      a.onAuthorize = () => expect(store.value, contains('pending'));
      final setup = SetupCoordinator(store, [a, b]);
      await setup.initialize();
      await setup.start();
      expect(setup.changes.every((c) => c.state == 'connected'), isTrue);
      await setup.undo();
      expect(log.where((s) => s.startsWith('undo:')), ['undo:b', 'undo:a']);
      expect(setup.needsRestoration, isFalse);
    },
  );
  test(
    'excludes assisted and irreversible routes and preserves existing connections',
    () async {
      final log = <String>[];
      final setup = SetupCoordinator(MemoryStore(), [
        FakeAdapter('assisted', log, reversibility: Reversibility.assisted),
        FakeAdapter(
          'irreversible',
          log,
          reversibility: Reversibility.irreversible,
        ),
        FakeAdapter('existing', log)..existing = true,
      ]);
      await setup.initialize();
      await setup.start();
      await setup.undo();
      expect(log, isEmpty);
      expect(setup.changes, isEmpty);
    },
  );
  test('denied authorization does not block another assistant', () async {
    final log = <String>[];
    final setup = SetupCoordinator(MemoryStore(), [
      FakeAdapter('a', log)..approved = false,
      FakeAdapter('b', log),
    ]);
    await setup.initialize();
    await setup.start();
    expect(setup.outcomes['a'], 'Skipped');
    expect(setup.outcomes['b'], 'Connected');
    expect(log, isNot(contains('apply:a')));
  });
  test(
    'failed connection test is compensated, never marked connected',
    () async {
      final a = FakeAdapter('a', [])..works = false;
      final setup = SetupCoordinator(MemoryStore(), [a]);
      await setup.initialize();
      await setup.start();
      expect(a.applied, isFalse);
      expect(setup.changes.single.state, 'restored');
    },
  );
  test(
    'stop during external authorization fences the late return and next adapter',
    () async {
      final log = <String>[];
      final entered = Completer<void>();
      final a = FakeAdapter('a', log)
        ..authorization = Completer<bool>()
        ..onAuthorize = () => entered.complete();
      final setup = SetupCoordinator(MemoryStore(), [a, FakeAdapter('b', log)]);
      await setup.initialize();
      final running = setup.start();
      await entered.future;
      final stopping = setup.stop();
      a.authorization!.complete(true);
      await running;
      await stopping;
      expect(log, ['authorize:a', 'undo:a']);
      expect(setup.phase, 'stopped');
    },
  );
  test('stop keeps already verified connections; undo removes them', () async {
    final a = FakeAdapter('a', []);
    final setup = SetupCoordinator(MemoryStore(), [a]);
    await setup.initialize();
    await setup.start();
    await setup.stop();
    expect(a.applied, isTrue);
    await setup.undo();
    expect(a.applied, isFalse);
  });
  test('failed undo remains durable and retries after relaunch', () async {
    final store = MemoryStore();
    final a = FakeAdapter('a', [])..undoWorks = false;
    final setup = SetupCoordinator(store, [a]);
    await setup.initialize();
    await setup.start();
    await setup.undo();
    expect(setup.phase, 'attention');
    expect(store.value, contains('failed'));
    a.undoWorks = true;
    final reopened = SetupCoordinator(store, [a]);
    await reopened.initialize();
    expect(reopened.phase, 'stopped');
    expect(a.applied, isFalse);
  });
  test(
    'crash between intent and completion compensates the pending operation',
    () async {
      final store = MemoryStore()
        ..value = jsonEncode({
          'version': 1,
          'phase': 'settingUp',
          'changes': [Change('session:a', 'a', {}).toJson()],
        });
      final a = FakeAdapter('a', [])..applied = true;
      final setup = SetupCoordinator(store, [a]);
      await setup.initialize();
      expect(a.applied, isFalse);
      expect(setup.changes.single.state, 'restored');
    },
  );
  test('missing adapter cannot falsely report restored', () async {
    final store = MemoryStore()
      ..value = jsonEncode({
        'version': 1,
        'phase': 'undoing',
        'changes': [Change('s:a', 'a', {}).toJson()],
      });
    final setup = SetupCoordinator(store, []);
    await setup.initialize();
    expect(setup.phase, 'attention');
    await expectLater(setup.start(), throwsStateError);
  });
  test(
    'storage failure blocks authorization and all following changes',
    () async {
      final store = MemoryStore();
      final log = <String>[];
      final setup = SetupCoordinator(store, [FakeAdapter('a', log)]);
      await setup.initialize();
      store.fail = true;
      await expectLater(setup.start(), throwsStateError);
      expect(log, isEmpty);
    },
  );
  test('unknown journal version fails closed', () async {
    final store = MemoryStore()..value = '{"version":2}';
    final setup = SetupCoordinator(store, []);
    await expectLater(setup.initialize(), throwsStateError);
    await expectLater(setup.start(), throwsStateError);
  });
}
