import { readFile, readdir } from "node:fs/promises";
const files = await readdir("dist-native");
const html = await readFile("dist-native/index.html", "utf8");
if (files.some((name) => /^(sw\.js|workbox-|manifest\.webmanifest)/.test(name)))
  throw new Error(
    "Native package must not contain a service worker or PWA manifest",
  );
if (!html.includes('http-equiv="Content-Security-Policy"'))
  throw new Error("Native Content Security Policy is missing");
if (!files.includes("assets"))
  throw new Error("Bundled frontend assets missing");
console.log(
  "Native bundle verified: local assets, CSP, no PWA service worker.",
);
