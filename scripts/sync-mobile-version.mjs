import { readFileSync, writeFileSync } from "node:fs";

const release = JSON.parse(readFileSync("mobile-version.json", "utf8"));
const version = process.env.APP_VERSION || release.version;
const buildNumber = Number(process.env.BUILD_NUMBER || release.buildNumber);
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(
    "APP_VERSION must contain three numeric components (e.g. 1.0.0).",
  );
}
if (
  !Number.isSafeInteger(buildNumber) ||
  buildNumber < 1 ||
  buildNumber > 2100000000
) {
  throw new Error(
    "BUILD_NUMBER must be a positive Android-compatible integer.",
  );
}
const path = "ios/App/App.xcodeproj/project.pbxproj";
const project = readFileSync(path, "utf8");
if (
  !project.includes("MARKETING_VERSION") ||
  !project.includes("CURRENT_PROJECT_VERSION")
) {
  throw new Error("The Xcode project version settings were not found.");
}
writeFileSync(
  path,
  project
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
    .replace(
      /CURRENT_PROJECT_VERSION = [^;]+;/g,
      `CURRENT_PROJECT_VERSION = ${buildNumber};`,
    ),
);
console.log(
  `Mobile version ${version}, build ${buildNumber}; Android reads the same version source.`,
);
