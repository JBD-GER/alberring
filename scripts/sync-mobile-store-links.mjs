import { readFileSync, writeFileSync } from "node:fs";
import { format } from "prettier";
import { storeLinksHtml } from "./mobile-store-links.mjs";

const root = new URL("../", import.meta.url);
const config = JSON.parse(
  readFileSync(new URL("mobile-distribution.json", root), "utf8"),
);
const section = storeLinksHtml(config);
const marker =
  /<!-- MOBILE_STORE_LINKS:START -->[\s\S]*?<!-- MOBILE_STORE_LINKS:END -->/;
const outputs = await Promise.all(
  ["invite", "recovery"].map(async (name) => {
    const path = new URL(`supabase/templates/${name}.html`, root);
    const source = readFileSync(path, "utf8");
    if (!marker.test(source))
      throw new Error(`Missing store-link section in ${name}.html`);
    const html = await format(source.replace(marker, section), {
      parser: "html",
    });
    return { path, source, html };
  }),
);
const stale = outputs.some(({ source, html }) => source !== html);
if (process.argv.includes("--check")) {
  if (stale)
    throw new Error(
      "Store-link templates are stale. Run npm run mobile:links.",
    );
} else {
  for (const { path, html } of outputs) writeFileSync(path, html);
}
console.log(
  "Invite and recovery store links validated. No emails sent or hosted templates changed.",
);
