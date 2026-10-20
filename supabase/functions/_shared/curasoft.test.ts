import { curasoftReadiness } from "./curasoft.ts";
const check = (value: boolean) => {
  if (!value) throw new Error("Unexpected CuraSoft readiness");
};
Deno.test("CuraSoft remains disabled without configuration", () => {
  const result = curasoftReadiness("org", {});
  check(result.status === "not_configured" && !result.synchronizationEnabled);
});
Deno.test(
  "CuraSoft never exposes credentials or credential presence across organizations",
  () => {
    const result = curasoftReadiness("other", {
      CURASOFT_ORGANIZATION_ID: "org",
      CURASOFT_ENVIRONMENT: "production",
      CURASOFT_API_KEY: "private-api",
      CURASOFT_ACCESS_KEY: "private-access",
    });
    check(Object.values(result.checks).every((value) => !value));
    check(!JSON.stringify(result).includes("private"));
  },
);
Deno.test(
  "Configured credentials still require field mapping and do not enable data transfers",
  () => {
    const result = curasoftReadiness("org", {
      CURASOFT_ORGANIZATION_ID: "org",
      CURASOFT_ENVIRONMENT: "test",
      CURASOFT_API_KEY: "private-api",
      CURASOFT_ACCESS_KEY: "private-access",
    });
    check(
      result.status === "mapping_required" && !result.synchronizationEnabled,
    );
    check(!JSON.stringify(result).includes("private"));
  },
);
Deno.test("Unknown environments and blank keys are rejected", () => {
  const result = curasoftReadiness("org", {
    CURASOFT_ORGANIZATION_ID: "org",
    CURASOFT_ENVIRONMENT: "https://attacker.test",
    CURASOFT_API_KEY: " ",
    CURASOFT_ACCESS_KEY: "x",
  });
  check(
    !result.checks.environment &&
      !result.checks.apiKey &&
      result.status === "not_configured",
  );
});
