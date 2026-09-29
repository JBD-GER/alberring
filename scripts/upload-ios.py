"""Validate the release identity and upload an IPA; never submit App Review."""
import base64
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import tempfile
import uuid
import zipfile


def required(name):
    value = os.environ.get(name, "")
    if not value:
        raise RuntimeError(f"Required protected upload value is missing: {name}")
    return value


def validate_package(ipa, version, build):
    with zipfile.ZipFile(ipa) as archive:
        manifests = [name for name in archive.namelist()
                     if re.fullmatch(r"Payload/[^/]+\.app/Info\.plist", name)]
        if len(manifests) != 1:
            raise RuntimeError("Expected exactly one iOS application in the IPA.")
        info = plistlib.loads(archive.read(manifests[0]))
    expected = {"CFBundleIdentifier": "de.alberring.connect",
                "CFBundleShortVersionString": version, "CFBundleVersion": build}
    if any(str(info.get(name, "")) != value for name, value in expected.items()):
        raise RuntimeError("IPA identity/version does not match the approved release.")
    if "iPhoneOS" not in info.get("CFBundleSupportedPlatforms", []):
        raise RuntimeError("A device IPA is required; simulator builds cannot be uploaded.")


def main():
    packages = list(Path("mobile-artifacts/ios").glob("*.ipa"))
    if len(packages) != 1:
        raise RuntimeError("Expected exactly one exported IPA.")
    ipa = packages[0].resolve()
    version = json.loads(Path("mobile-version.json").read_text())["version"]
    build = required("BUILD_NUMBER")
    validate_package(ipa, version, build)
    key_id = required("APP_STORE_CONNECT_KEY_ID")
    issuer = required("APP_STORE_CONNECT_ISSUER_ID")
    if not re.fullmatch(r"[A-Z0-9]{10}", key_id):
        raise RuntimeError("Invalid App Store Connect key ID.")
    uuid.UUID(issuer)
    key_bytes = base64.b64decode(required("APP_STORE_CONNECT_KEY_BASE64"), validate=True)
    if not key_bytes.startswith(b"-----BEGIN PRIVATE KEY-----"):
        raise RuntimeError("Expected an Apple PKCS8 private key.")
    child_environment = {name: value for name, value in os.environ.items()
                         if name != "APP_STORE_CONNECT_KEY_BASE64"}
    with tempfile.TemporaryDirectory(prefix="alberring-upload-", dir=required("RUNNER_TEMP")) as directory:
        keys = Path(directory) / "private_keys"
        keys.mkdir(mode=0o700)
        key = keys / f"AuthKey_{key_id}.p8"
        descriptor = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as output:
            output.write(key_bytes)
        common = ["--type", "ios", "--file", str(ipa), "--apiKey", key_id,
                  "--apiIssuer", issuer, "--output-format", "json"]
        for operation in ["--validate-app", "--upload-app"]:
            subprocess.run(["xcrun", "altool", operation, *common], cwd=directory,
                           env=child_environment, check=True)
    print(f"Alberring {version} ({build}) uploaded; Apple processing must be verified separately.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, KeyError, zipfile.BadZipFile, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
