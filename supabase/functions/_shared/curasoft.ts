/** Preparation only: no external requests or employee-data synchronization yet. */
export type CurasoftReadiness = {
  status: "not_configured" | "mapping_required";
  synchronizationEnabled: false;
  checks: {
    organization: boolean;
    environment: boolean;
    apiKey: boolean;
    accessKey: boolean;
  };
};

export function curasoftReadiness(
  organizationId: string,
  environment: Record<string, string | undefined>,
): CurasoftReadiness {
  const organization = environment.CURASOFT_ORGANIZATION_ID === organizationId;
  // Do not disclose even credential presence to a different organization.
  const checks = {
    organization,
    environment:
      organization &&
      ["test", "production"].includes(environment.CURASOFT_ENVIRONMENT ?? ""),
    apiKey: organization && Boolean(environment.CURASOFT_API_KEY?.trim()),
    accessKey: organization && Boolean(environment.CURASOFT_ACCESS_KEY?.trim()),
  };
  return {
    status: Object.values(checks).every(Boolean)
      ? "mapping_required"
      : "not_configured",
    synchronizationEnabled: false,
    checks,
  };
}
