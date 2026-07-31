import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = join(repositoryRoot, "supabase", "migrations");
const migrations = readdirSync(migrationsDirectory)
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort()
  .map((fileName) => join(migrationsDirectory, fileName));
const seed = join(repositoryRoot, "supabase", "seed.sql");

const block = (absolutePath) => {
  const sourcePath = relative(repositoryRoot, absolutePath).replaceAll(
    "\\",
    "/",
  );
  const source = readFileSync(absolutePath, "utf8").trimEnd();
  return `-- ===== ${sourcePath} =====\n${source}\n`;
};

const buildBundle = ({ header, migrationFiles, target }) => {
  const sections = [...migrationFiles, seed].map(block).join("\n");
  const content = `${header}
-- Automatisch erzeugt mit: npm run supabase:build:setup
-- Nicht manuell bearbeiten; maßgeblich sind supabase/migrations und seed.sql.
begin;

${sections}
commit;
`;
  writeFileSync(join(repositoryRoot, target), content);
};

buildBundle({
  header: `-- Alberring Connect - FRISCHES LEERES Supabase-Projekt
-- Nicht auf ein bereits eingerichtetes Projekt anwenden.`,
  migrationFiles: migrations,
  target: "supabase/SETUP_FRESH.sql",
});

buildBundle({
  header: `-- Alberring Connect - EINMALIGES UPGRADE
-- Fuer ein Projekt, in dem 202607100001 und 202607100002 bereits liefen.`,
  migrationFiles: migrations.filter(
    (migration) => !/20260710000[12]_/.test(migration),
  ),
  target: "supabase/SETUP_UPGRADE_20260710.sql",
});
