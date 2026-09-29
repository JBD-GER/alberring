"""Restore CI signing files without printing credential values. No network calls."""
import base64
from datetime import datetime, timezone
import os
from pathlib import Path
import plistlib
import subprocess
import sys


def required(name):
    value = os.environ.get(name, "")
    if not value:
        raise RuntimeError(f"Required protected CI value is missing: {name}")
    return value


def decode(name, path):
    path.write_bytes(base64.b64decode(required(name), validate=True))
    path.chmod(0o600)


def run(*args):
    result = subprocess.run(args, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(f"Signing setup command failed: {args[0]} {args[1]}")
    return result.stdout


def main():
    temporary = Path(required("RUNNER_TEMP"))
    platform = sys.argv[1]
    if platform == "android":
        for name in ["ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD"]:
            required(name)
        keystore = temporary / "alberring-upload.jks"
        decode("ANDROID_KEYSTORE_BASE64", keystore)
        with open(required("GITHUB_ENV"), "a", encoding="utf8") as environment:
            environment.write(f"ANDROID_KEYSTORE_PATH={keystore}\n")
        if os.environ.get("GOOGLE_SERVICES_JSON_BASE64"):
            decode("GOOGLE_SERVICES_JSON_BASE64", Path("android/app/google-services.json"))
        elif os.environ.get("VITE_PUSH_ENABLED") == "true":
            raise RuntimeError("Enabled Android push requires GOOGLE_SERVICES_JSON_BASE64.")
    elif platform == "ios":
        team = required("APPLE_TEAM_ID")
        profile_name = required("IOS_PROFILE_NAME")
        password = required("IOS_KEYCHAIN_PASSWORD")
        certificate_password = required("IOS_CERTIFICATE_PASSWORD")
        certificate = temporary / "alberring-distribution.p12"
        profile = temporary / "alberring.mobileprovision"
        keychain = temporary / "alberring-signing.keychain-db"
        decode("IOS_CERTIFICATE_BASE64", certificate)
        decode("IOS_PROFILE_BASE64", profile)
        contents = plistlib.loads(run("security", "cms", "-D", "-i", str(profile)))
        if contents.get("Name") != profile_name or team not in contents.get("TeamIdentifier", []):
            raise RuntimeError("The provisioning profile does not match the configured team/name.")
        if contents.get("Entitlements", {}).get("application-identifier") != f"{team}.de.alberring.connect":
            raise RuntimeError("The provisioning profile does not match de.alberring.connect.")
        expiration = contents.get("ExpirationDate")
        if not expiration or expiration.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
            raise RuntimeError("The provisioning profile has expired.")
        if contents.get("ProvisionedDevices") or contents.get("ProvisionsAllDevices") or contents.get("Entitlements", {}).get("get-task-allow"):
            raise RuntimeError("An App Store distribution profile is required.")
        # Xcode 16+ uses UserData; also support the legacy profile location.
        for relative in ["Library/Developer/Xcode/UserData/Provisioning Profiles", "Library/MobileDevice/Provisioning Profiles"]:
            profiles = Path.home() / relative
            profiles.mkdir(parents=True, exist_ok=True)
            destination = profiles / "alberring-ci.mobileprovision"
            destination.write_bytes(profile.read_bytes())
            destination.chmod(0o600)
        run("security", "create-keychain", "-p", password, str(keychain))
        run("security", "set-keychain-settings", "-lut", "21600", str(keychain))
        run("security", "unlock-keychain", "-p", password, str(keychain))
        run("security", "import", str(certificate), "-P", certificate_password, "-A", "-t", "cert", "-f", "pkcs12", "-k", str(keychain))
        run("security", "set-key-partition-list", "-S", "apple-tool:,apple:", "-k", password, str(keychain))
        run("security", "list-keychains", "-d", "user", "-s", str(keychain))
        options = {"method": "app-store-connect", "teamID": team, "signingStyle": "manual",
                   "provisioningProfiles": {"de.alberring.connect": profile_name},
                   "manageAppVersionAndBuildNumber": False, "uploadSymbols": True}
        (temporary / "ExportOptions.plist").write_bytes(plistlib.dumps(options))
    else:
        raise RuntimeError("Expected android or ios.")
    print(f"Protected {platform} signing configuration restored.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, KeyError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
