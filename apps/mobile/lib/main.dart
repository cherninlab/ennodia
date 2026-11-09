import 'package:flutter/material.dart';
import 'app.dart';
import 'device_services.dart';
import 'setup.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Add only adapters with a documented round trip and verified compensation.
  runApp(
    EnnodiaApp(
      setup: SetupCoordinator(SecureJournalStore(), []),
      discover: DeviceDiscovery().discover,
    ),
  );
}
