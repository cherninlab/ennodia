import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'setup.dart';

class SecureJournalStore implements JournalStore {
  static const _storage = FlutterSecureStorage(
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.unlocked_this_device,
    ),
  );
  static const _key = 'ennodia.setup.v1';

  @override
  Future<String?> read() => _storage.read(key: _key);
  @override
  Future<void> write(String value) => _storage.write(key: _key, value: value);
}

class AssistantAvailability {
  const AssistantAvailability(this.name, this.detected, this.detail);
  final String name;
  final bool detected;
  final String detail;
}

class DeviceDiscovery {
  static const _channel = MethodChannel('com.cherninlab.ennodia/discovery');

  Future<List<AssistantAvailability>> discover() async {
    final rows = await _channel.invokeListMethod<dynamic>('discover') ?? [];
    return rows.map((value) {
      final row = Map<String, dynamic>.from(value as Map);
      return AssistantAvailability(
        row['name'] as String,
        row['detected'] as bool,
        row['detail'] as String,
      );
    }).toList();
  }
}
