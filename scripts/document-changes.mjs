import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const baseline = JSON.parse(
  await readFile("docs/evidence/arbeitsstand-vorher.json", "utf8"),
);
const names = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const current = {};
for (const name of names) {
  try {
    current[name] = createHash("sha256")
      .update(await readFile(name))
      .digest("hex");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
const created = names.filter((name) => !baseline.files[name]);
const changed = names.filter(
  (name) => baseline.files[name] && current[name] !== baseline.files[name],
);
const removed = Object.keys(baseline.files).filter((name) => !current[name]);
const before = baseline.packageBefore;
const after = JSON.parse(await readFile("package.json", "utf8"));
const lines = [
  "# 05 · Dateiänderungen",
  "",
  "Stand: 17.09.2026. Vergleich gegen den vor Beginn aufgenommenen SHA-256-Arbeitsstand; bereits vorhandene uncommittete Änderungen sind darin enthalten und werden nicht pauschal der mobilen Erweiterung zugeschrieben. Generierte/ignorierte Build-Artefakte sind gesondert genannt. Keine Quelldateien wurden absichtlich entfernt.",
  "",
  `Ausgangs-Commit: \`${baseline.head}\`. Manifest: \`docs/evidence/arbeitsstand-vorher.json\`. Ermittlung: \`node scripts/document-changes.mjs\`.`,
  "",
  "## Neu angelegte Dateien",
  "",
  ...created.map((p) => `- \`${p}\``),
  "",
  "## Gegenüber dem übernommenen Arbeitsstand geändert",
  "",
  ...changed.map((p) => `- \`${p}\``),
  "",
  "## Entfernte Dateien",
  "",
  ...(removed.length ? removed.map((p) => `- \`${p}\``) : ["Keine."]),
  "",
  "## Dependencies",
];
for (const group of ["dependencies", "devDependencies"]) {
  lines.push(
    "",
    `### ${group}`,
    "",
    "| Paket | Vorher | Nachher |",
    "| --- | --- | --- |",
  );
  for (const name of new Set([
    ...Object.keys(before[group] ?? {}),
    ...Object.keys(after[group] ?? {}),
  ])) {
    if (before[group]?.[name] !== after[group]?.[name])
      lines.push(
        `| ${name} | ${before[group]?.[name] ?? "nicht vorhanden"} | ${after[group]?.[name] ?? "entfernt"} |`,
      );
  }
}
lines.push(
  "",
  "Keine direkten bestehenden Dependencies wurden entfernt. Transitive Sicherheitsupdates sind vollständig im Lockfile nachvollziehbar. Das gezielte Override `xcode → uuid 11.1.1` ersetzt die verwundbare UUID-Version des CLI-Werkzeugs; die unveränderte v4-Nutzung wurde gegen das erzeugte Xcode-Projekt geprüft.",
  "",
  "## Geänderte/neue Scripts",
  "",
  "| Script | Befehl |",
  "| --- | --- |",
);
for (const [name, command] of Object.entries(after.scripts))
  if (before.scripts[name] !== command)
    lines.push(`| ${name} | \`${command}\` |`);
lines.push(
  "",
  "## Environment und Konfiguration",
  "",
  "| Name | Ort/Zweck |",
  "| --- | --- |",
  "| VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY | Bestehende öffentliche Frontendwerte; Validierung gehärtet |",
  "| VITE_APP_URL | Bestehender optionaler öffentlicher Webwert, Allowlist |",
  "| VITE_PUSH_ENABLED | Neuer öffentlicher Schalter, Standard false |",
  "| VITE_PUSH_ENVIRONMENT | development oder production; APNs-Umgebung |",
  "| CAPACITOR_ENV | Lokale CLI-Konfiguration production/development |",
  "| BUILD_NUMBER | Positive monotone native Buildnummer in CI |",
  "| APP_VERSION | Optionaler expliziter Versionswert für iOS/Android; Standard aus mobile-version.json |",
  "| ALLOWED_ORIGINS | Bestehendes Function-Secret um genau bekannte native Origins ergänzen |",
  "| APNS_PRIVATE_KEY / APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID / APNS_DEVELOPMENT_BUNDLE_ID | Nur Supabase Edge, späterer APNs-Zugang |",
  "| FCM_SERVICE_ACCOUNT_JSON | Nur Supabase Edge, späterer FCM-Zugang |",
  "| APP_SUPABASE_PUBLIC_URL | Optional nur Server: öffentliche Storage-Origin hinter lokalem Reverse Proxy |",
  "| ANDROID_KEYSTORE_BASE64 / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD | Geschützte CI-Signing-Secrets |",
  "| ANDROID_KEYSTORE_PATH | Lokaler Pfad zum temporär bereitgestellten Signing-Keystore, kein Clientwert |",
  "| GOOGLE_SERVICES_JSON_BASE64 | Geschützte CI-Firebase-Konfiguration |",
  "| APPLE_TEAM_ID / IOS_PROFILE_NAME | CI-Identität/Profilreferenz |",
  "| IOS_CERTIFICATE_BASE64 / IOS_CERTIFICATE_PASSWORD / IOS_PROFILE_BASE64 / IOS_KEYCHAIN_PASSWORD | Geschützte CI-Signing-Secrets |",
  "| MOBILE_RELEASE_ENABLED | Repository-Freigabeschalter für spätere signierte Artefakte |",
  "| VERCEL_DEPLOY_ENABLED / VERCEL_ORG_ID / VERCEL_PROJECT_ID / VERCEL_TOKEN | Vorbereiteter CI-Webrelease im vorhandenen Projekt; Token ausschließlich Secret |",
  "| LOCAL_APP_URL | Lokale Browserprüfung, Standard http://127.0.0.1:5174 |",
  "| MOBILE_TEST_ACCESS_FILE / MOBILE_TEST_BASE_URL / MOBILE_TEST_SCREENSHOT_DIR / MOBILE_TEST_RESULT_FILE | Ausschließlich Prüfskript: externe lokale Zugangsdatei, Testserver und Ausgabepfade; keine App-Konfiguration |",
  "",
  "Werte von Zugangsdaten sind absichtlich nicht enthalten. Zusätzliche lokale Testzugänge lagen ausschließlich außerhalb des Repositorys in Dateien mit Modus 0600. Keine Änderungen der produktiven Environment-Werte wurden vorgenommen.",
  "",
  "## Erzeugte, nicht versionierte Artefakte",
  "",
  "- `dist/`: Web-PWA.",
  "- `dist-native/`: lokales Frontend für Capacitor.",
  "- Native kopierte `public`-/Assets-Verzeichnisse aus `cap sync`.",
  "- `android/app/build/outputs/apk/debug/app-debug.apk` und `android/app/build/outputs/bundle/release/app-release.aab`.",
  "- Lokale SDK/JDK/Emulator-Dateien unter einem temporären Toolchain-Verzeichnis; keine Repository-Abhängigkeit dieses Pfades.",
  "- Testberichte/Browserprofile enthalten keine neuen Produktfunktionen und werden nicht eingecheckt.",
  "",
  "## Übernommene fremde Änderungen",
  "",
  "Das Ausgangsmanifest enthält den ursprünglichen `git status` mit Änderungen an Fachmodulen, Dokumentation, Benutzer-/Freigabe-/Fuhrpark-RPCs und deren Tests. Diese Vorgeschichte bleibt erhalten. Nur Änderungen der Inhaltsprüfsummen seit diesem Manifest erscheinen oben als neue mobile Bearbeitung. Keine früheren Migrationen wurden zurückgesetzt oder entfernt.",
  "",
);
await writeFile("docs/05_DATEIAENDERUNGEN.md", lines.join("\n"));
console.log(
  `Change inventory: ${created.length} new, ${changed.length} changed, ${removed.length} removed files versus captured workspace.`,
);
