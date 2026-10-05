"""Choose genuine simulator devices with App Store screenshot dimensions."""
import json
import os
import subprocess


def simctl(*args):
    return subprocess.check_output(["xcrun", "simctl", *args], text=True).strip()


runtimes = [r for r in json.loads(simctl("list", "runtimes", "--json"))["runtimes"]
            if r.get("isAvailable") and ".iOS-" in r["identifier"]]
runtime = max(runtimes, key=lambda r: tuple(map(int, r["version"].split("."))))
devices = json.loads(simctl("list", "devicetypes", "--json"))["devicetypes"]
if os.environ["SCREENSHOT_DEVICE"] == "iphone":
    choices = ["iPhone 14 Plus", "iPhone 13 Pro Max", "iPhone 12 Pro Max", "iPhone 11 Pro Max"]
    device = next(d for name in choices for d in devices if d["name"] == name)
else:
    device = next(d for d in devices if d["name"].startswith("iPad Pro 13-inch"))
identifier = simctl("create", "Alberring Store Screenshots", device["identifier"], runtime["identifier"])
with open(os.environ["GITHUB_ENV"], "a") as env:
    env.write(f"SCREENSHOT_SIMULATOR={identifier}\n")
    env.write(f"SCREENSHOT_DEVICE_NAME={device['name']}\n")
    env.write(f"SCREENSHOT_RUNTIME={runtime['name']}\n")
print(f"Prepared {device['name']} on {runtime['name']}")
