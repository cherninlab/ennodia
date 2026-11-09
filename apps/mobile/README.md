# Ennodia Mobile

Your AI assistants, working together. A Flutter application for Android and iOS.

This is milestone M0, version `0.1.0+1`, under active development. It is not a
store release and cannot send prompts to assistant accounts yet.

## Run

Requires Flutter 3.44.6 / Dart 3.12.2 or compatible versions. Keep Flutter
packages in this directory; the existing core remains Bun-first.

```sh
flutter pub get
flutter analyze
flutter test
flutter run
```

Run `bun run mobile:verify` from the repository root for analysis and tests.
Android needs the Android SDK; iOS needs full Xcode and plugin build tooling.
Bundle identifiers are development defaults, pending store-account registration.

## Implemented

- Restrained welcome, discovery, stopped, recovery, and unavailable-chat states.
- Kotlin discovery of Claude, ChatGPT, and Gemini through declared package
  visibility. Detection never implies a working connection.
- Swift platform channel with honest unavailable discovery results. No iOS
  provider schemes or callback contracts have been validated yet.
- Platform-neutral setup coordinator: snapshot before changes, journal intent
  before authorization, verify before marking connected, reverse-order undo,
  and verification of restoration. Pre-existing connections are excluded.
- Stop immediately fences new work. Late authorization results are compensated;
  Stop keeps verified connections, while Stop & undo removes this setup's changes.
- Secure journal using Keychain on iOS and encrypted storage on Android. Android
  backup is disabled and iOS keychain entitlements are configured.
- Interrupted setup is rolled back on next launch. Failed restoration stays in
  the journal and blocks new setup. No background restart of setup is scheduled.

The production adapter registry is deliberately empty. Test adapters live only
in tests. The disabled composer makes the missing conversation path explicit.
This coordinator currently handles one setup transaction: undo it before starting
another transaction that creates connections. Connection management is M1 work.

## Adapter contract

`lib/setup.dart` owns shared lifecycle and rollback rules. Native code only owns
platform discovery. A future provider adapter must:

1. Use a documented public request/response route and establish its permission,
   account, billing, and revocation requirements. Opening an app is insufficient.
2. Declare automatic, assisted, or irreversible restoration before enrollment.
   Default setup accepts automatic restoration only.
3. Snapshot state without mutation; preserve all pre-existing credentials,
   permissions, and connections. Keep secrets out of UI text and logs.
4. Treat authorization as a mutation: its pending change is durable before it
   begins. Use the journal operation ID for idempotent apply/undo and recovery,
   including when a response or token receipt is lost after a remote change.
5. Observe cancellation, abort pending requests where supported, and fence late
   callbacks. Compensation waits for the in-flight operation to settle.
6. Verify a real request/response path, and independently verify restoration.
   Undo must be safe when authorization was denied or apply never completed.

A provider without durable reconciliation after a lost response cannot qualify
for automatic setup. Prompts already sent cannot be undone. Ennodia cannot place
its controls over another app or revoke arbitrary system/privacy grants.

## Next milestones

| Milestone | Exit condition |
| --- | --- |
| M0 foundation | Unit/widget tests for lifecycle and honest UI; native build validation remains pending. |
| M1 first connection | One supported adapter on each OS, authorization UI, secure credentials, real prompt/answer, task identity, cancellation, connection management, verified revocation. |
| M2 orchestration | Route to multiple verified assistants, preserve independent answers and task IDs, reuse Ennodia core semantics where a supported transport is available. |
| M3 device beta | Force-kill during authorization/apply/undo, offline recovery, permission denial, large text, accessibility, and background-return tests on both platforms. Signed TestFlight and Android internal-test builds. |

Do not expose the existing localhost-only Ennodia IO server to the LAN as an
implicit mobile bridge. Remote pairing needs its own authenticated transport
and threat review before implementation. A desktop bridge is not a substitute
for a standalone mobile product without an explicit product decision.

## Evidence and limits — 9 November 2026

The development Mac has Flutter 3.44.6 but no Android SDK and an incomplete Xcode
installation. Dart analysis and all 18 Flutter tests passed. APK/IPA compilation,
native discovery, secure-store behavior, and device lifecycle behavior remain
unverified. Tests exercise deterministic adapters, not provider accounts.

Sources used for this implementation:

- [Flutter platform channels](https://docs.flutter.dev/platform-integration/platform-channels)
- [Android scoped package visibility](https://developer.android.com/training/package-visibility/declaring)
- [Apple URL capability checks](https://developer.apple.com/documentation/uikit/uiapplication/canopenurl(_:))
- [Secure storage platform configuration](https://pub.dev/packages/flutter_secure_storage)
- Provider package identities: [Claude](https://play.google.com/store/apps/details?id=com.anthropic.claude), [ChatGPT](https://play.google.com/store/apps/details?id=com.openai.chatgpt), [Gemini](https://play.google.com/store/apps/details?id=com.google.android.apps.bard).
