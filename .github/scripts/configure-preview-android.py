from pathlib import Path
import shutil
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

# KidsLoc App launcher identity: use the same branded management logo as the web and in-app login.
manifest_text = manifest.read_text()
manifest_text = manifest_text.replace('android:label="kidsloc"', 'android:label="KidsLoc App"')
manifest_text = manifest_text.replace('android:label="Flutter"', 'android:label="KidsLoc App"')
if 'android:label="KidsLoc App"' not in manifest_text:
    manifest_text = manifest_text.replace("<application", '<application android:label="KidsLoc App"', 1)
manifest.write_text(manifest_text)

source_icon = Path("apps/mobile_flutter/assets/kidsloc-brand.webp")
if not source_icon.is_file():
    raise SystemExit(f"KidsLoc icon asset not found: {source_icon}")
res = android_root / "app" / "src" / "main" / "res"
(res / "drawable-nodpi").mkdir(parents=True, exist_ok=True)
shutil.copyfile(source_icon, res / "drawable-nodpi" / "kidsloc_launcher_foreground.webp")
(res / "values").mkdir(parents=True, exist_ok=True)
(res / "values" / "kidsloc_icon_colors.xml").write_text(
    '<resources><color name="kidsloc_launcher_background">#20A8F5</color></resources>'
)
(res / "mipmap-anydpi-v26").mkdir(parents=True, exist_ok=True)
adaptive = '''<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/kidsloc_launcher_background" />
    <foreground android:drawable="@drawable/kidsloc_launcher_foreground" />
</adaptive-icon>'''
(res / "mipmap-anydpi-v26" / "ic_launcher.xml").write_text(adaptive)
(res / "mipmap-anydpi-v26" / "ic_launcher_round.xml").write_text(adaptive)
# Fallback icons for Android versions before adaptive launcher icons.
for density in ("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"):
    target = res / f"mipmap-{density}"
    target.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source_icon, target / "ic_launcher.webp")
    shutil.copyfile(source_icon, target / "ic_launcher_round.webp")
