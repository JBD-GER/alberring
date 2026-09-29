import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("mobile-version.json", "utf8"));
if (
  process.env.GITHUB_REF_TYPE === "tag" &&
  process.env.GITHUB_REF_NAME !== `v${version}`
) {
  throw new Error("The release tag must match mobile-version.json exactly.");
}
for (const key of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]) {
  const value = process.env[key];
  if (!value || /placeholder|example|ci-public/i.test(value)) {
    throw new Error(
      `${key} must contain the real public production configuration.`,
    );
  }
}
const backend = new URL(process.env.VITE_SUPABASE_URL);
if (backend.protocol !== "https:")
  throw new Error("Release backend must use HTTPS.");
const number = Number(process.env.BUILD_NUMBER);
if (!Number.isSafeInteger(number) || number < 1 || number > 2100000000) {
  throw new Error("A valid monotonically increasing BUILD_NUMBER is required.");
}
console.log(
  `Release configuration checked: version ${version}, build ${number}.`,
);
