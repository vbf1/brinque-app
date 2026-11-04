from pathlib import Path
import sys

android_root = Path(sys.argv[1])
settings = android_root / "settings.gradle.kts"
settings_text = settings.read_text()
plugin_declaration = '    id("com.google.gms.google-services") version "4.4.4" apply false'
if plugin_declaration not in settings_text:
    settings_text = settings_text.replace("plugins {", "plugins {\n" + plugin_declaration, 1)
settings.write_text(settings_text)

app_gradle = android_root / "app" / "build.gradle.kts"
app_text = app_gradle.read_text()
plugin_apply = '    id("com.google.gms.google-services")'
if plugin_apply not in app_text:
    app_text = app_text.replace(
        '    id("dev.flutter.flutter-gradle-plugin")',
        '    id("dev.flutter.flutter-gradle-plugin")\n' + plugin_apply,
        1,
    )
app_gradle.write_text(app_text)

manifest = android_root / "app" / "src" / "main" / "AndroidManifest.xml"
manifest_text = manifest.read_text()
permission = '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />'
if "android.permission.POST_NOTIFICATIONS" not in manifest_text:
    manifest_text = manifest_text.replace("<application", permission + "\n    <application", 1)
metadata = (
    '        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" '
    'android:value="kidsloc_notifications" />'
)
fid_metadata = (
    '        <meta-data android:name="firebase_messaging_installation_id_enabled" '
    'android:value="true" />'
)
if "default_notification_channel_id" not in manifest_text or "firebase_messaging_installation_id_enabled" not in manifest_text:
    marker = "<application"
    position = manifest_text.find(">", manifest_text.find(marker)) + 1
    additions = ""
    if "default_notification_channel_id" not in manifest_text:
        additions += "\n" + metadata
    if "firebase_messaging_installation_id_enabled" not in manifest_text:
        additions += "\n" + fid_metadata
    manifest_text = manifest_text[:position] + additions + manifest_text[position:]
manifest.write_text(manifest_text)

app_gradle = android_root / "app" / "build.gradle.kts"
app_text = app_gradle.read_text()
app_text = app_text.replace("minSdk = flutter.minSdkVersion", "minSdk = maxOf(flutter.minSdkVersion, 24)")
app_gradle.write_text(app_text)

activity = next((android_root / "app" / "src" / "main" / "kotlin").rglob("MainActivity.kt"))
activity.write_text("""package br.com.sonhokids.kidsloc

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        "kidsloc_notifications",
        "Avisos do KidsLoc",
        NotificationManager.IMPORTANCE_HIGH
      ).apply { description = "Lembretes e avisos importantes do KidsLoc App" }
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }
}
""")
