import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "EnnodiaDiscovery")!
    let channel = FlutterMethodChannel(
      name: "com.cherninlab.ennodia/discovery", binaryMessenger: registrar.messenger())
    channel.setMethodCallHandler { call, result in
      guard call.method == "discover" else {
        result(FlutterMethodNotImplemented)
        return
      }
      // No provider scheme has a validated integration contract yet.
      result(["Claude", "ChatGPT", "Gemini"].map { name in
        ["name": name, "detected": false,
         "detail": "A supported discovery route is not available yet."] as [String: Any]
      })
    }
  }
}
