import 'dart:convert';

import 'package:flutter/foundation.dart';

enum Reversibility { automatic, assisted, irreversible }

class Cancellation {
  bool stopped = false;
  void check() {
    if (stopped) throw const SetupStopped();
  }
}

class SetupStopped implements Exception {
  const SetupStopped();
}

abstract interface class JournalStore {
  Future<String?> read();
  Future<void> write(String value);
}

/// Native adapters must make apply/undo idempotent by Change.id. Authorization
/// is a mutation too: its intent is journaled before opening an external flow.
/// Cancellation must abort requests where supported and fence late callbacks.
abstract interface class SetupAdapter {
  String get id;
  Reversibility get reversibility;
  Future<Map<String, dynamic>> snapshot();
  bool alreadyConnected(Map<String, dynamic> before);
  Future<bool> authorize(Change change, Cancellation cancellation);
  Future<void> apply(Change change, Cancellation cancellation);
  Future<bool> verify(Change change);
  Future<void> undo(Change change);
  Future<bool> restored(Change change);
}

class Change {
  Change(this.id, this.adapterId, this.before, {this.state = 'pending'});
  final String id;
  final String adapterId;
  final Map<String, dynamic> before;
  String state;

  Map<String, dynamic> toJson() => {
    'id': id,
    'adapter': adapterId,
    'before': before,
    'state': state,
  };
  factory Change.fromJson(Map<String, dynamic> json) => Change(
    json['id'] as String,
    json['adapter'] as String,
    Map<String, dynamic>.from(json['before'] as Map),
    state: json['state'] as String,
  );
}

/// One setup transaction at a time. Failed or interrupted changes remain in the
/// journal until compensation has been verified. Existing connections are never
/// enrolled in a new transaction.
class SetupCoordinator extends ChangeNotifier {
  SetupCoordinator(this.store, List<SetupAdapter> adapters)
    : adapters = {for (final adapter in adapters) adapter.id: adapter};

  final JournalStore store;
  final Map<String, SetupAdapter> adapters;
  final List<Change> changes = [];
  final Map<String, String> outcomes = {};
  String phase = 'idle';
  String? issue;
  Cancellation _cancellation = Cancellation();
  Future<void>? _active;
  Future<void> _writes = Future.value();
  bool _initialized = false;
  bool _undoRequested = false;
  bool get busy => _active != null;
  bool get needsRestoration => changes.any(
    (change) => change.state == 'pending' || change.state == 'failed',
  );

  Future<void> _save() {
    // Capture now, serialize writes, and retain failures: no mutation may follow
    // a failed durable write. Restart/recovery is required in that case.
    final value = jsonEncode({
      'version': 1,
      'phase': phase,
      'changes': changes.map((change) => change.toJson()).toList(),
    });
    _writes = _writes.then((_) => store.write(value));
    return _writes;
  }

  Future<void> _exclusive(Future<void> Function() work) {
    if (busy) return Future.error(StateError('Setup is already active.'));
    // Assign the future before work can notify listeners.
    final future = Future<void>.microtask(work);
    _active = future;
    return future
        .catchError((Object error) {
          issue = 'Setup needs attention. Reopen Ennodia to recover safely.';
          _cancellation.stopped = true;
          throw error;
        })
        .whenComplete(() {
          _active = null;
          notifyListeners();
        });
  }

  Future<void> initialize() => _exclusive(() async {
    if (_initialized) return;
    final raw = await store.read();
    if (raw != null) {
      final json = jsonDecode(raw) as Map<String, dynamic>;
      if (json['version'] != 1) throw StateError('Unknown journal version.');
      phase = json['phase'] as String;
      if (!{
        'idle',
        'settingUp',
        'ready',
        'stopped',
        'undoing',
        'repairing',
        'attention',
      }.contains(phase)) {
        throw StateError('Invalid journal phase.');
      }
      changes.addAll(
        (json['changes'] as List).map(
          (value) => Change.fromJson(Map<String, dynamic>.from(value as Map)),
        ),
      );
      if (changes.any(
            (change) => !{
              'pending',
              'connected',
              'restored',
              'failed',
            }.contains(change.state),
          ) ||
          changes.map((change) => change.id).toSet().length != changes.length) {
        throw StateError('Invalid journal changes.');
      }
      if (phase == 'settingUp' || phase == 'undoing' || phase == 'attention') {
        await _rollback();
      } else if (phase == 'repairing' || needsRestoration) {
        // Stop/keep retains verified connections, not unfinished operations.
        await _rollback(unfinishedOnly: true);
      }
    }
    _initialized = true;
  });

  Future<void> start() {
    if (busy) return Future.error(StateError('Setup is already active.'));
    _cancellation = Cancellation();
    _undoRequested = false;
    return _exclusive(() async {
      if (!_initialized || needsRestoration || issue != null) {
        throw StateError('Recover the previous setup first.');
      }
      if (_cancellation.stopped) {
        phase = 'stopped';
        await _save();
        return;
      }
      if (changes.any((change) => change.state == 'connected')) {
        throw StateError('Undo this setup before starting another.');
      }
      phase = 'settingUp';
      outcomes.clear();
      await _save();
      notifyListeners();
      final session = DateTime.now().microsecondsSinceEpoch.toString();
      changes.clear();
      await _save();
      for (final adapter in adapters.values) {
        if (_cancellation.stopped) break;
        if (adapter.reversibility != Reversibility.automatic) {
          outcomes[adapter.id] = 'Requires manual setup';
          continue;
        }
        Change? change;
        try {
          final before = await adapter.snapshot();
          _cancellation.check();
          if (adapter.alreadyConnected(before)) {
            outcomes[adapter.id] = 'Existing connection preserved';
            continue;
          }
          change = Change('$session:${adapter.id}', adapter.id, before);
          changes.add(change);
          await _save();
          _cancellation.check();
          final authorized = await adapter.authorize(change, _cancellation);
          _cancellation.check();
          if (!authorized) {
            outcomes[adapter.id] = 'Skipped';
            await _restore(change);
            if (needsRestoration) break;
            continue;
          }
          await adapter.apply(change, _cancellation);
          _cancellation.check();
          if (!await adapter.verify(change)) {
            throw StateError('Connection verification failed.');
          }
          _cancellation.check();
          change.state = 'connected';
          await _save();
          outcomes[adapter.id] = 'Connected';
        } catch (error) {
          if (change != null) await _restore(change);
          outcomes[adapter.id] = error is SetupStopped
              ? 'Stopped'
              : 'Could not connect';
        }
        notifyListeners();
        if (needsRestoration) break;
      }
      phase = _undoRequested
          ? 'undoing'
          : needsRestoration
          ? (_cancellation.stopped ? 'repairing' : 'attention')
          : (_cancellation.stopped ? 'stopped' : 'ready');
      await _save();
    });
  }

  /// The in-memory fence is synchronous, including while an external app is
  /// foreground. Completion waits for the adapter to settle before undo starts.
  Future<void> stop() async {
    _cancellation.stopped = true;
    if (_undoRequested) {
      phase = 'undoing';
    } else if (phase == 'settingUp') {
      phase = 'stopped';
    }
    notifyListeners();
    await _save();
    await _active;
  }

  Future<void> undo() async {
    _undoRequested = true;
    await stop();
    await _exclusive(_rollback);
  }

  Future<void> _restore(Change change) async {
    try {
      final adapter = adapters[change.adapterId];
      if (adapter == null) throw StateError('Adapter unavailable.');
      await adapter.undo(change);
      change.state = await adapter.restored(change) ? 'restored' : 'failed';
    } catch (_) {
      change.state = 'failed';
    }
    await _save();
  }

  Future<void> _rollback({bool unfinishedOnly = false}) async {
    phase = unfinishedOnly ? 'repairing' : 'undoing';
    await _save();
    notifyListeners();
    for (final change in changes.reversed) {
      if (change.state == 'restored') continue;
      if (unfinishedOnly && change.state == 'connected') continue;
      await _restore(change);
      outcomes[change.adapterId] = change.state == 'restored'
          ? 'Restored automatically'
          : 'Restoration failed — retry required';
      notifyListeners();
    }
    phase = needsRestoration
        ? (unfinishedOnly ? 'repairing' : 'attention')
        : 'stopped';
    await _save();
  }
}
