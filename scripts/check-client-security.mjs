import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
const problems = [];
async function scan(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) {
      await scan(file);
      continue;
    }
    if (!/\.(js|ts|tsx|html|json)$/.test(file) || /\.test\./.test(file))
      continue;
    const source = await readFile(file, "utf8");
    if (
      /sb_secret_[A-Za-z0-9_-]{15,}|sk_(live|test)_[A-Za-z0-9]{15,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(
        source,
      )
    )
      problems.push(`${file}: private credential pattern`);
    for (const match of source.matchAll(
      /eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g,
    )) {
      try {
        if (
          JSON.parse(Buffer.from(match[1], "base64url").toString()).role ===
          "service_role"
        )
          problems.push(`${file}: service-role JWT`);
      } catch {
        /* Only valid JSON tokens have role claims. */
      }
    }
  }
}
await scan("src");
for (const dir of ["dist", "dist-native"]) {
  try {
    await scan(dir);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(
  "Client source and available bundles: no private credential patterns found (not a substitute for a full secret audit).",
);
