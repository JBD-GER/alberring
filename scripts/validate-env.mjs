import { loadEnv } from "vite";
import { validatePublicEnvironment } from "./public-env.mjs";
const native = process.argv[2] === "native";
const env = {
  ...loadEnv(native ? "native" : "production", process.cwd(), "VITE_"),
  ...process.env,
};
const errors = validatePublicEnvironment(env, { native });
if (errors.length) {
  console.error(`Invalid build environment:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
