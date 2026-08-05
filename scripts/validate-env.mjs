import { loadEnv } from "vite";

const viteEnv = loadEnv("production", process.cwd(), "VITE_");
const env = { ...viteEnv, ...process.env };
const errors = [];

for (const name of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]) {
  if (!env[name]?.trim()) {
    errors.push(`${name} is required`);
  }
}

if (env.VITE_SUPABASE_URL?.trim()) {
  try {
    const url = new URL(env.VITE_SUPABASE_URL.trim());

    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
      errors.push("VITE_SUPABASE_URL must be a valid HTTP(S) URL");
    }
  } catch {
    errors.push("VITE_SUPABASE_URL must be a valid HTTP(S) URL");
  }
}

if (errors.length > 0) {
  console.error(`Invalid build environment:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
