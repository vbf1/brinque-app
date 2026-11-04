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

# KidsLoc App launcher identity: branded icon and visible Android app name.
manifest_text = manifest.read_text()
manifest_text = manifest_text.replace('android:label="kidsloc"', 'android:label="KidsLoc App"')
manifest_text = manifest_text.replace('android:label="Flutter"', 'android:label="KidsLoc App"')
if 'android:label="KidsLoc App"' not in manifest_text:
    manifest_text = manifest_text.replace("<application", '<application android:label="KidsLoc App"', 1)
manifest_text = manifest_text.replace('android:icon="@mipmap/ic_launcher"', 'android:icon="@mipmap/ic_launcher"')
manifest.write_text(manifest_text)

res = android_root / "app" / "src" / "main" / "res"
(res / "drawable").mkdir(parents=True, exist_ok=True)
(res / "values").mkdir(parents=True, exist_ok=True)
(res / "mipmap-anydpi-v26").mkdir(parents=True, exist_ok=True)

foreground = """<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#FFC928"
        android:pathData="M54,8 C31,8 14,25 14,47 C14,69 54,101 54,101 C54,101 94,69 94,47 C94,25 77,8 54,8 Z"/>
    <path android:fillColor="#FFFFFF"
        android:pathData="M54,20 C39,20 27,32 27,47 C27,62 39,74 54,74 C69,74 81,62 81,47 C81,32 69,20 54,20 Z"/>
    <path android:fillColor="#174A91"
        android:pathData="M33,45 L33,39 L42,32 L51,39 L51,45 L57,45 L57,39 L66,32 L75,39 L75,45 L78,45 L78,69 L30,69 L30,45 Z"/>
    <path android:fillColor="#FFC928"
        android:pathData="M48,54 L60,54 L60,69 L48,69 Z"/>
    <path android:fillColor="#FFFFFF"
        android:pathData="M37,49 L43,49 L43,55 L37,55 Z M65,49 L71,49 L71,55 L65,55 Z"/>
</vector>
"""
(res / "drawable" / "kidsloc_icon_foreground.xml").write_text(foreground)
(res / "values" / "kidsloc_icon_colors.xml").write_text("""<resources><color name="kidsloc_icon_background">#102B52</color></resources>""")
(res / "mipmap-anydpi-v26" / "ic_launcher.xml").write_text("""<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/kidsloc_icon_background" />
    <foreground android:drawable="@drawable/kidsloc_icon_foreground" />
</adaptive-icon>""")
(res / "mipmap-anydpi-v26" / "ic_launcher_round.xml").write_text("""<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/kidsloc_icon_background" />
    <foreground android:drawable="@drawable/kidsloc_icon_foreground" />
</adaptive-icon>""")
