export type Permission = `${string}.${string}`;
export interface Profile {
  id: string;
  organization_id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
  status: "invited" | "active" | "suspended" | "archived";
}
export interface AppSession {
  profile: Profile;
  permissions: string[];
  onboarding: {
    required: boolean;
    eligible: boolean;
    completedAt: string | null;
  };
  productTour: {
    required: boolean;
    eligible: boolean;
    completedAt: string | null;
    currentStep: number;
    version: number;
    deferredUntil: string | null;
  };
}
export interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  permission?: string;
}
