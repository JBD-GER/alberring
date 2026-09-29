import fs from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import xcode from "xcode";

export function configureSigning(path, team, profile) {
  if (!/^[A-Z0-9]{10}$/.test(team || "") || !profile) {
    throw new Error(
      "The Apple team and provisioning profile must be configured.",
    );
  }
  const project = xcode.project(path);
  project.parseSync();
  const configurations = Object.values(
    project.pbxXCBuildConfigurationSection(),
  );
  const application = configurations.filter(
    (config) =>
      config.name === "Release" &&
      config.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER ===
        "de.alberring.connect",
  );
  if (application.length !== 1) {
    throw new Error("Expected exactly one Alberring Release target.");
  }
  Object.assign(application[0].buildSettings, {
    DEVELOPMENT_TEAM: team,
    CODE_SIGN_STYLE: "Manual",
    CODE_SIGN_IDENTITY: '"Apple Distribution"',
    PROVISIONING_PROFILE_SPECIFIER: JSON.stringify(profile),
  });
  fs.writeFileSync(path, project.writeSync());
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  configureSigning(
    "ios/App/App.xcodeproj/project.pbxproj",
    process.env.APPLE_TEAM_ID,
    process.env.IOS_PROFILE_NAME,
  );
  console.log("Configured manual signing for the Alberring app target only.");
}
