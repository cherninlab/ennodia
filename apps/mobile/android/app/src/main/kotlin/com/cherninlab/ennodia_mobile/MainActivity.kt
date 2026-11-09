package com.cherninlab.ennodia_mobile

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger,
            "com.cherninlab.ennodia/discovery").setMethodCallHandler { call, result ->
            if (call.method != "discover") {
                result.notImplemented()
                return@setMethodCallHandler
            }
            val apps = listOf(
                "Claude" to "com.anthropic.claude",
                "ChatGPT" to "com.openai.chatgpt",
                "Gemini" to "com.google.android.apps.bard"
            )
            result.success(apps.map { (name, packageName) ->
                val detected = try {
                    @Suppress("DEPRECATION")
                    packageManager.getPackageInfo(packageName, 0)
                    true
                } catch (_: android.content.pm.PackageManager.NameNotFoundException) {
                    false
                }
                mapOf("name" to name, "detected" to detected,
                    "detail" to if (detected) "App found. A supported connection is not available yet."
                    else "Not detected through permitted device checks.")
            })
        }
    }
}
