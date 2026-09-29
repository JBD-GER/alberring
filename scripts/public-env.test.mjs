import { expect, it } from "vitest";
import { validatePublicEnvironment } from "./public-env.mjs";
const base = {
  VITE_SUPABASE_URL: "https://project.supabase.co",
  VITE_SUPABASE_ANON_KEY: "sb_publishable_public",
};
it("rejects private keys and accidental public secrets without echoing values", () => {
  const token = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
  expect(
    validatePublicEnvironment({ ...base, VITE_SUPABASE_ANON_KEY: token }),
  ).not.toEqual([]);
  expect(
    validatePublicEnvironment({
      ...base,
      VITE_OPENAI_SECRET: "sensitive",
    }).join(),
  ).not.toContain("sensitive");
  expect(
    validatePublicEnvironment({
      ...base,
      VITE_SUPABASE_ANON_KEY: "sb_secret_sensitive",
    }),
  ).not.toEqual([]);
});
it("requires TLS for native apps while permitting local web development", () => {
  const local = { ...base, VITE_SUPABASE_URL: "http://127.0.0.1:54321" };
  expect(validatePublicEnvironment(local)).toEqual([]);
  expect(validatePublicEnvironment(local, { native: true })).not.toEqual([]);
  expect(validatePublicEnvironment(base, { native: true })).toEqual([]);
});

it("accepts the Vercel preview environment without changing native validation", () => {
  const deployment = {
    ...base,
    VITE_VERCEL_GIT_REPO_ID: "123",
    VITE_VERCEL_ENV: "preview",
    VITE_VERCEL_GIT_PULL_REQUEST_ID: "",
    VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG: "{}",
    VITE_VERCEL_BRANCH_URL: "alberring-branch.vercel.app",
    VITE_VERCEL_GIT_COMMIT_SHA: "123abc",
    VITE_VERCEL_URL: "alberring-preview.vercel.app",
    VITE_VERCEL_GIT_COMMIT_AUTHOR_NAME: "Build author",
    VITE_VERCEL_GIT_PREVIOUS_SHA: "456def",
    VITE_VERCEL_PROJECT_ID: "prj_example",
    VITE_VERCEL_PROJECT_PRODUCTION_URL: "alberringapp.vercel.app",
    VITE_VERCEL_DEPLOYMENT_ID: "dpl_example",
  };
  expect(validatePublicEnvironment(deployment)).toEqual([]);
  expect(validatePublicEnvironment(deployment, { native: true })).toContain(
    "Unapproved client variable: VITE_VERCEL_DEPLOYMENT_ID",
  );
});

it("still rejects unknown Vercel-prefixed credentials without exposing values", () => {
  const errors = validatePublicEnvironment({
    ...base,
    VITE_VERCEL_TOKEN: "sensitive-token",
    VITE_VERCEL_OIDC_TOKEN: "sensitive-oidc-token",
    VITE_VERCEL_SECRET: "sensitive-secret",
  });
  expect(errors).toHaveLength(3);
  expect(errors.join()).not.toContain("sensitive");
});
