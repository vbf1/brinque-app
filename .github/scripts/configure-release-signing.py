from pathlib import Path
import base64
import os
import re
import sys

android_root = Path(sys.argv[1])
required = [
    "KIDSLOC_KEYSTORE_BASE64",
    "KIDSLOC_KEYSTORE_PASSWORD",
    "KIDSLOC_KEY_ALIAS",
    "KIDSLOC_KEY_PASSWORD",
]
missing = [name for name in required if not os.environ.get(name)]
if missing:
    raise SystemExit("Missing GitHub Actions signing secrets: " + ", ".join(missing))

keystore = android_root / "app" / "kidsloc-upload.jks"
keystore.write_bytes(base64.b64decode(os.environ["KIDSLOC_KEYSTORE_BASE64"], validate=True))

app_gradle = android_root / "app" / "build.gradle.kts"
text = app_gradle.read_text()

signing_block = """
    signingConfigs {
        create("kidslocRelease") {
            storeFile = file("kidsloc-upload.jks")
            storePassword = System.getenv("KIDSLOC_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("KIDSLOC_KEY_ALIAS")
            keyPassword = System.getenv("KIDSLOC_KEY_PASSWORD")
        }
    }
"""

if 'create("kidslocRelease")' not in text:
    if not re.search(r"^android\s*\{", text, re.MULTILINE):
        raise SystemExit("Could not find the Android Gradle configuration block")
    text = re.sub(
        r"^android\s*\{",
        lambda match: match.group(0) + signing_block,
        text,
        count=1,
        flags=re.MULTILINE,
    )

# Flutter's generated Kotlin Gradle template may indent release differently
# across versions. Match the release block structurally instead of fixed spaces.
release_match = re.search(r"(?m)^(\s*)release\s*\{", text)
if not release_match:
    raise SystemExit("Could not find buildTypes.release in app/build.gradle.kts")

indent = release_match.group(1) + "    "
release_start = release_match.end()
release_end = text.find("\n" + release_match.group(1) + "}", release_start)
if release_end == -1:
    raise SystemExit("Could not determine the end of buildTypes.release")

release_body = text[release_start:release_end]
release_body = re.sub(
    r"(?m)^\s*signingConfig\s*=\s*signingConfigs\.getByName\([^)]*\)\s*\n?",
    "",
    release_body,
)
release_body = "\n" + indent + 'signingConfig = signingConfigs.getByName("kidslocRelease")\n' + release_body.lstrip("\n")
text = text[:release_start] + release_body + text[release_end:]

if 'signingConfig = signingConfigs.getByName("kidslocRelease")' not in text:
    raise SystemExit("Release signing configuration was not applied")
if not keystore.is_file() or keystore.stat().st_size == 0:
    raise SystemExit("KidsLoc release keystore was not written")

app_gradle.write_text(text)
print("KidsLoc release signing configured and verified in build.gradle.kts.")
