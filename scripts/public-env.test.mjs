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
