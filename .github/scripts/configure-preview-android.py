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

# KidsLoc App launcher identity: install a native vector icon (no raster/photo fallback).
manifest_text = manifest.read_text()
manifest_text = manifest_text.replace('android:label="kidsloc"', 'android:label="KidsLoc App"')
manifest_text = manifest_text.replace('android:label="Flutter"', 'android:label="KidsLoc App"')
if 'android:label="KidsLoc App"' not in manifest_text:
    manifest_text = manifest_text.replace("<application", '<application android:label="KidsLoc App"', 1)
manifest_text = manifest_text.replace('android:icon="@mipmap/ic_launcher"', 'android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher_round"')
manifest.write_text(manifest_text)

res = android_root / "app" / "src" / "main" / "res"
# Remove the generic Flutter robot PNGs so they cannot override the KidsLoc vector resources.
for old_dir in res.glob("mipmap-*"):
    if old_dir.is_dir() and old_dir.name not in ("mipmap-anydpi", "mipmap-anydpi-v26"):
        for old_icon in old_dir.glob("ic_launcher*"):
            if old_icon.is_file():
                old_icon.unlink()
(res / "drawable").mkdir(parents=True, exist_ok=True)
(res / "values").mkdir(parents=True, exist_ok=True)
(res / "mipmap-anydpi").mkdir(parents=True, exist_ok=True)
(res / "mipmap-anydpi-v26").mkdir(parents=True, exist_ok=True)
vector = """<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#168CF0" android:pathData="M25,3 H83 C95,3 105,13 105,25 V83 C105,95 95,105 83,105 H25 C13,105 3,95 3,83 V25 C3,13 13,3 25,3 Z"/>
    <path android:fillColor="#FFD65A" android:pathData="M37,18 C42.5,18 47,22.5 47,28 C47,33.5 42.5,38 37,38 C31.5,38 27,33.5 27,28 C27,22.5 31.5,18 37,18 Z"/>
    <path android:fillColor="#FFBD4A" android:pathData="M71,18 C76.5,18 81,22.5 81,28 C81,33.5 76.5,38 71,38 C65.5,38 61,33.5 61,28 C61,22.5 65.5,18 71,18 Z"/>
    <path android:fillColor="#FFD65A" android:pathData="M16,54 C17,39 25,31 37,31 C49,31 57,39 58,54 Z"/>
    <path android:fillColor="#FFBD4A" android:pathData="M50,54 C51,39 59,31 71,31 C83,31 91,39 92,54 Z"/>
    <path android:fillColor="#FFFFFF" android:strokeColor="#D8E9FF" android:strokeWidth="2" android:pathData="M26,42 H82 C88,42 92,46 92,52 V91 C92,97 88,101 82,101 H26 C20,101 16,97 16,91 V52 C16,46 20,42 26,42 Z"/>
    <path android:fillColor="#0752C7" android:strokeColor="#FFFFFF" android:strokeWidth="2" android:pathData="M43,34 H65 C69,34 72,37 72,41 V48 H36 V41 C36,37 39,34 43,34 Z"/>
    <path android:fillColor="#20B86A" android:pathData="M30,62 L34,66 L42,56 L46,59 L35,73 L27,65 Z"/>
    <path android:fillColor="#20B86A" android:pathData="M30,81 L34,85 L42,75 L46,78 L35,92 L27,84 Z"/>
    <path android:fillColor="#8CA3C5" android:pathData="M52,61 H78 V66 H52 Z M52,80 H78 V85 H52 Z"/>
</vector>"""
(res / "drawable" / "kidsloc_launcher_foreground.xml").write_text(vector)
# Full-color legacy vector launcher; Android 5+ resolves these, Android 8+ uses adaptive resources below.
(res / "mipmap-anydpi" / "ic_launcher.xml").write_text(vector)
(res / "mipmap-anydpi" / "ic_launcher_round.xml").write_text(vector)
adaptive = """<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/kidsloc_launcher_background" />
    <foreground android:drawable="@drawable/kidsloc_launcher_foreground" />
</adaptive-icon>"""
(res / "values" / "kidsloc_icon_colors.xml").write_text(
    '<resources><color name="kidsloc_launcher_background">#168CF0</color></resources>'
)
(res / "mipmap-anydpi-v26" / "ic_launcher.xml").write_text(adaptive)
(res / "mipmap-anydpi-v26" / "ic_launcher_round.xml").write_text(adaptive)
