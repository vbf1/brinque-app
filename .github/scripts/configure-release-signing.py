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
try:
    decoded = base64.b64decode(os.environ["KIDSLOC_KEYSTORE_BASE64"], validate=True)
except Exception as error:
    raise SystemExit("KIDSLOC_KEYSTORE_BASE64 não contém Base64 válido") from error
if not decoded:
    raise SystemExit("O keystore codificado está vazio")
keystore.write_bytes(decoded)

app_gradle = android_root / "app" / "build.gradle.kts"
text = app_gradle.read_text()

android_match = re.search(r"(?m)^([ \t]*)android[ \t]*\{", text)
if not android_match:
    raise SystemExit("Could not find the Android Gradle configuration block")

signing_block = (
    '\n    signingConfigs {\n'
    '        create("kidslocRelease") {\n'
    '            storeFile = file("kidsloc-upload.jks")\n'
    '            storePassword = System.getenv("KIDSLOC_KEYSTORE_PASSWORD")\n'
    '            keyAlias = System.getenv("KIDSLOC_KEY_ALIAS")\n'
    '            keyPassword = System.getenv("KIDSLOC_KEY_PASSWORD")\n'
    '        }\n'
    '    }\n'
)

if 'create("kidslocRelease")' not in text:
    insert_at = android_match.end()
    text = text[:insert_at] + signing_block + text[insert_at:]

release_match = re.search(r"(?m)^([ \t]*)release[ \t]*\{", text)
if not release_match:
    raise SystemExit("Could not find buildTypes.release in app/build.gradle.kts")

# Find the matching closing brace by counting braces from the release block.
open_brace = text.find("{", release_match.start(), release_match.end())
depth = 0
release_end = None
for index in range(open_brace, len(text)):
    if text[index] == "{":
        depth += 1
    elif text[index] == "}":
        depth -= 1
        if depth == 0:
            release_end = index
            break
if release_end is None:
    raise SystemExit("Could not determine the end of buildTypes.release")

release_body = text[open_brace + 1:release_end]
release_body = re.sub(
    r"(?m)^[ \t]*signingConfig[ \t]*=[ \t]*signingConfigs\.getByName\([^)]*\)[ \t]*\n?",
    "",
    release_body,
)
indent = release_match.group(1) + "    "
release_body = "\n" + indent + 'signingConfig = signingConfigs.getByName("kidslocRelease")\n' + release_body.lstrip("\n")
text = text[:open_brace + 1] + release_body + text[release_end:]

if 'signingConfig = signingConfigs.getByName("kidslocRelease")' not in text:
    raise SystemExit("Release signing configuration was not applied")
if not keystore.is_file() or keystore.stat().st_size == 0:
    raise SystemExit("KidsLoc release keystore was not written")

app_gradle.write_text(text)
print("KidsLoc release signing configured and verified in build.gradle.kts.")
