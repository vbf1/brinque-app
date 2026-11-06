from pathlib import Path
import os, sys, base64
android_root = Path(sys.argv[1])
required = ["KIDSLOC_KEYSTORE_BASE64", "KIDSLOC_KEYSTORE_PASSWORD", "KIDSLOC_KEY_ALIAS", "KIDSLOC_KEY_PASSWORD"]
missing = [name for name in required if not os.environ.get(name)]
if missing:
    raise SystemExit("Missing GitHub Actions signing secrets: " + ", ".join(missing))
keystore = android_root / "app" / "kidsloc-upload.jks"
keystore.write_bytes(base64.b64decode(os.environ["KIDSLOC_KEYSTORE_BASE64"]))
app_gradle = android_root / "app" / "build.gradle.kts"
text = app_gradle.read_text()
block = '''
    signingConfigs {
        create("release") {
            storeFile = file("kidsloc-upload.jks")
            storePassword = System.getenv("KIDSLOC_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("KIDSLOC_KEY_ALIAS")
            keyPassword = System.getenv("KIDSLOC_KEY_PASSWORD")
        }
    }
'''
if "signingConfigs {" not in text:
    text = text.replace("android {", "android {" + block, 1)
if 'signingConfig = signingConfigs.getByName("release")' not in text:
    text = text.replace("        release {", '        release {\n            signingConfig = signingConfigs.getByName("release")', 1)
app_gradle.write_text(text)
print("Persistent KidsLoc release signing configured.")
