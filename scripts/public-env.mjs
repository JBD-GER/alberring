export function validatePublicEnvironment(env, { native = false } = {}) {
  const errors = [];
  const allowed = new Set([
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_APP_URL",
    "VITE_PUSH_ENABLED",
    "VITE_PUSH_ENVIRONMENT",
  ]);
  // Vercel injects these public deployment details into web builds. Keep an
  // explicit list so credentials with a similar prefix still fail validation.
  if (!native) {
    for (const name of [
      "VITE_VERCEL_GIT_REPO_ID",
      "VITE_VERCEL_GIT_REPO_OWNER",
      "VITE_VERCEL_GIT_REPO_SLUG",
      "VITE_VERCEL_GIT_PROVIDER",
      "VITE_VERCEL_ENV",
      "VITE_VERCEL_TARGET_ENV",
      "VITE_VERCEL_GIT_PULL_REQUEST_ID",
      "VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG",
      "VITE_VERCEL_BRANCH_URL",
      "VITE_VERCEL_GIT_COMMIT_SHA",
      "VITE_VERCEL_GIT_COMMIT_REF",
      "VITE_VERCEL_GIT_COMMIT_MESSAGE",
      "VITE_VERCEL_URL",
      "VITE_VERCEL_GIT_COMMIT_AUTHOR_NAME",
      "VITE_VERCEL_GIT_COMMIT_AUTHOR_LOGIN",
      "VITE_VERCEL_GIT_PREVIOUS_SHA",
      "VITE_VERCEL_PROJECT_ID",
      "VITE_VERCEL_PROJECT_PRODUCTION_URL",
      "VITE_VERCEL_DEPLOYMENT_ID",
    ])
      allowed.add(name);
  }
  for (const name of Object.keys(env)) {
    if (name.startsWith("VITE_") && !allowed.has(name))
      errors.push(`Unapproved client variable: ${name}`);
  }
  for (const name of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]) {
    if (!env[name]?.trim()) errors.push(`${name} is required`);
  }
  if (env.VITE_SUPABASE_URL) {
    try {
      const url = new URL(env.VITE_SUPABASE_URL);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (
        url.username ||
        url.password ||
        (url.protocol !== "https:" &&
          !(url.protocol === "http:" && local && !native))
      )
        errors.push(
          "Backend must use HTTPS (HTTP is allowed only for local web tests)",
        );
    } catch {
      errors.push("Invalid Supabase URL");
    }
  }
  const key = env.VITE_SUPABASE_ANON_KEY ?? "";
  if (
    key.startsWith("sb_secret_") ||
    /service_role|PRIVATE KEY|sk_live_|sk_test_/.test(key)
  )
    errors.push("Private credential prohibited in client configuration");
  if (key.split(".").length === 3) {
    try {
      const payload = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      );
      if (payload.role !== "anon")
        errors.push("Only the public anon JWT may be bundled");
    } catch {
      errors.push("Invalid public JWT");
    }
  } else if (
    key &&
    !key.startsWith("sb_publishable_") &&
    !(env.CI === "true" && key === "ci-public-anon-key")
  ) {
    errors.push("Use a Supabase publishable key or legacy anon JWT");
  }
  if (
    env.VITE_PUSH_ENABLED &&
    !["true", "false"].includes(env.VITE_PUSH_ENABLED)
  )
    errors.push("VITE_PUSH_ENABLED must be true or false");
  if (
    env.VITE_PUSH_ENVIRONMENT &&
    !["production", "development"].includes(env.VITE_PUSH_ENVIRONMENT)
  )
    errors.push("Invalid push environment");
  return errors;
}
