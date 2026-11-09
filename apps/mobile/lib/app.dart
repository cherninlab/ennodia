import 'package:flutter/material.dart';
import 'device_services.dart';
import 'setup.dart';

class EnnodiaApp extends StatelessWidget {
  const EnnodiaApp({super.key, required this.setup, required this.discover});
  final SetupCoordinator setup;
  final Future<List<AssistantAvailability>> Function() discover;
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Ennodia',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xff626548),
        surface: const Color(0xfff7f5ee),
      ),
      scaffoldBackgroundColor: const Color(0xfff7f5ee),
      useMaterial3: true,
    ),
    home: SetupScreen(setup: setup, discover: discover),
  );
}

class SetupScreen extends StatefulWidget {
  const SetupScreen({super.key, required this.setup, required this.discover});
  final SetupCoordinator setup;
  final Future<List<AssistantAvailability>> Function() discover;
  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  List<AssistantAvailability> _assistants = [];
  bool _loading = true,
      _discovering = false,
      _stopped = false,
      _finished = false;
  String? _error;
  @override
  void initState() {
    super.initState();
    _initialize();
  }

  Future<void> _initialize() async {
    try {
      await widget.setup.initialize();
    } catch (_) {
      _error =
          'Your setup record could not be recovered. No new connections will be made.';
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _start() async {
    setState(() {
      _discovering = true;
      _stopped = false;
      _error = null;
    });
    try {
      final assistants = await widget.discover();
      if (_stopped || !mounted) return;
      setState(() => _assistants = assistants);
      await widget.setup.start();
      if (mounted && !_stopped) setState(() => _finished = true);
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Setup could not finish. No assistant is marked connected.',
        );
      }
    } finally {
      if (mounted) setState(() => _discovering = false);
    }
  }

  Future<void> _stop({required bool undo}) async {
    setState(() => _stopped = true);
    try {
      if (undo) {
        await widget.setup.undo();
      } else {
        await widget.setup.stop();
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Setup stopped. Reopen Ennodia to recover the setup record.',
        );
      }
    }
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.setup,
    builder: (context, _) {
      final busy = _discovering || widget.setup.busy;
      final attention = widget.setup.needsRestoration;
      return Scaffold(
        appBar: AppBar(title: const Text('Ennodia')),
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 540),
              child: ListView(
                padding: const EdgeInsets.all(28),
                children: [
                  const SizedBox(height: 48),
                  Text(
                    attention
                        ? 'Setup needs attention.'
                        : _stopped
                        ? 'Setup stopped.'
                        : busy && !_loading
                        ? 'Finding your assistants.'
                        : _finished
                        ? 'Your assistants, together.'
                        : 'Your AI assistants,\nworking together.',
                    style: Theme.of(context).textTheme.headlineLarge,
                  ),
                  const SizedBox(height: 20),
                  Text(
                    attention
                        ? 'Some changes could not be restored. Retry undo before connecting anything else.'
                        : _stopped
                        ? 'No new connections will be made.'
                        : _finished
                        ? 'No compatible connections are available in this early build.'
                        : 'Ennodia checks available connections. You authorize only what is needed.',
                  ),
                  const SizedBox(height: 28),
                  if (_loading) const LinearProgressIndicator(),
                  if (_error != null)
                    Text(
                      _error!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  for (final assistant in _assistants)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(assistant.name),
                      subtitle: Text(assistant.detail),
                      trailing: Text(
                        assistant.detected ? 'Detected' : 'Not detected',
                      ),
                    ),
                  for (final outcome in widget.setup.outcomes.entries)
                    ListTile(
                      title: Text(outcome.key),
                      subtitle: Text(outcome.value),
                    ),
                  if (!_loading && !busy && !attention && _error == null)
                    FilledButton(
                      onPressed: _start,
                      child: Text(
                        _finished || _stopped
                            ? 'Check again'
                            : 'Find compatible assistants',
                      ),
                    ),
                  if (busy && !_loading) ...[
                    const SizedBox(height: 20),
                    OutlinedButton(
                      onPressed: () => _stop(undo: false),
                      child: const Text('Stop'),
                    ),
                    TextButton(
                      onPressed: () => _stop(undo: true),
                      child: const Text('Stop & undo'),
                    ),
                  ],
                  if (!busy && (attention || _stopped))
                    TextButton(
                      onPressed: () => _stop(undo: true),
                      child: Text(attention ? 'Retry undo' : 'Undo setup'),
                    ),
                  if (_finished) ...[
                    const SizedBox(height: 36),
                    const TextField(
                      enabled: false,
                      decoration: InputDecoration(
                        hintText:
                            'Connect an assistant to start a conversation',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ],
                  const SizedBox(height: 36),
                  Text(
                    'Early development · No assistant accounts are connected by this build.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    },
  );
}
