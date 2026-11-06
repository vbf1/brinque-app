from pathlib import Path
import re
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
install_permission = '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />'
if "android.permission.POST_NOTIFICATIONS" not in manifest_text:
    manifest_text = manifest_text.replace("<application", permission + "\n    <application", 1)
if "android.permission.REQUEST_INSTALL_PACKAGES" not in manifest_text:
    manifest_text = manifest_text.replace("<application", install_permission + "\n    <application", 1)
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
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

class MainActivity : FlutterActivity() {
  private val updateChannel = "br.com.sonhokids.kidsloc/apk_installer"

  override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
    super.configureFlutterEngine(flutterEngine)
    MethodChannel(flutterEngine.dartExecutor.binaryMessenger, updateChannel).setMethodCallHandler { call, result ->
      if (call.method != "installApk") {
        result.notImplemented()
        return@setMethodCallHandler
      }
      val path = call.argument<String>("path")
      if (path.isNullOrBlank()) {
        result.error("INVALID_PATH", "Caminho do APK não informado.", null)
        return@setMethodCallHandler
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
        val settingsIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))
        startActivity(settingsIntent)
        result.success(false)
        return@setMethodCallHandler
      }
      try {
        val apk = File(path)
        if (!apk.exists() || !apk.isFile) {
          result.error("APK_NOT_FOUND", "O arquivo de atualização não foi encontrado.", null)
          return@setMethodCallHandler
        }
        val apkUri = FileProvider.getUriForFile(this, "$packageName.fileprovider", apk)
        val installIntent = Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(apkUri, "application/vnd.android.package-archive")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(installIntent)
        result.success(true)
      } catch (error: Exception) {
        result.error("INSTALL_FAILED", error.message, null)
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel("kidsloc_notifications", "Avisos do KidsLoc", NotificationManager.IMPORTANCE_HIGH)
        .apply { description = "Lembretes e avisos importantes do KidsLoc App" }
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }
}
""")

provider = """        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/kidsloc_file_paths" />
        </provider>"""
if "androidx.core.content.FileProvider" not in manifest_text:
    manifest_text = manifest_text.replace("</application>", provider + "\n    </application>", 1)
manifest.write_text(manifest_text)

app_text = app_gradle.read_text()
if 'implementation("androidx.core:core:1.13.1")' not in app_text:
    if "dependencies {" in app_text:
        app_text = app_text.replace("dependencies {", 'dependencies {\n    implementation("androidx.core:core:1.13.1")', 1)
    else:
        app_text += '\ndependencies { implementation("androidx.core:core:1.13.1") }\n'
app_gradle.write_text(app_text)

xml_dir = android_root / "app" / "src" / "main" / "res" / "xml"
xml_dir.mkdir(parents=True, exist_ok=True)
(xml_dir / "kidsloc_file_paths.xml").write_text("""<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <cache-path name="kidsloc_updates" path="updates/" />
</paths>
""")

# KidsLoc App launcher identity: use the exact same branded logo file as the web login.
manifest_text = manifest.read_text()
manifest_text = manifest_text.replace('android:label="kidsloc"', 'android:label="KidsLoc App"')
manifest_text = manifest_text.replace('android:label="Flutter"', 'android:label="KidsLoc App"')
if 'android:label="KidsLoc App"' not in manifest_text:
    manifest_text = manifest_text.replace("<application", '<application android:label="KidsLoc App"', 1)

# Explicitly bind both launcher entry points to the branded resources. Do not rely
# on Flutter's generated template defaults, which may vary between Flutter versions.
def set_launcher_resources(match):
    attrs = match.group(1)
    for name, value in (
        ("icon", "@mipmap/ic_launcher"),
        ("roundIcon", "@mipmap/ic_launcher_round"),
    ):
        pattern = rf'android:{name}="[^"]*"'
        replacement = f'android:{name}="{value}"'
        if re.search(pattern, attrs):
            attrs = re.sub(pattern, replacement, attrs, count=1)
        else:
            attrs += f' {replacement}'
    return "<application" + attrs + ">"

manifest_text, application_count = re.subn(
    r"<application\b([^>]*)>",
    set_launcher_resources,
    manifest_text,
    count=1,
)
if application_count != 1:
    raise SystemExit("Could not explicitly configure the Android launcher icon in AndroidManifest.xml")
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
    # Flutter's generated Android host already contains PNG launcher icons.
    # Android treats PNG and WebP files with the same resource name as duplicates,
    # so remove the generated PNG variants before installing the branded WebP icons.
    for icon_name in ("ic_launcher", "ic_launcher_round"):
        (target / f"{icon_name}.png").unlink(missing_ok=True)
    shutil.copyfile(source_icon, target / "ic_launcher.webp")
    shutil.copyfile(source_icon, target / "ic_launcher_round.webp")
