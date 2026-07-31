export type IntegrationCapability =
  "employees.pull" | "schedules.pull" | "availability.push";
export class NotConfiguredError extends Error {
  readonly code = "NOT_CONFIGURED";
  constructor(provider: string) {
    super(`${provider} ist nicht konfiguriert.`);
  }
}
export interface IntegrationProvider {
  getCapabilities(): IntegrationCapability[];
  testConnection(): Promise<void>;
  pullEmployees(): Promise<unknown[]>;
  pullSchedules(): Promise<unknown[]>;
  pushAvailability(): Promise<void>;
}
export class ManualProvider implements IntegrationProvider {
  getCapabilities(): IntegrationCapability[] {
    return [];
  }
  async testConnection(): Promise<void> {
    return Promise.resolve();
  }
  async pullEmployees(): Promise<unknown[]> {
    return [];
  }
  async pullSchedules(): Promise<unknown[]> {
    return [];
  }
  async pushAvailability(): Promise<void> {
    return Promise.resolve();
  }
}
export class CarevilleProvider implements IntegrationProvider {
  getCapabilities() {
    return [];
  }
  async testConnection(): Promise<never> {
    throw new NotConfiguredError("Careville");
  }
  async pullEmployees(): Promise<never> {
    throw new NotConfiguredError("Careville");
  }
  async pullSchedules(): Promise<never> {
    throw new NotConfiguredError("Careville");
  }
  async pushAvailability(): Promise<never> {
    throw new NotConfiguredError("Careville");
  }
}
