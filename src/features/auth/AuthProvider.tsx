import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { disablePush } from "../../services/platform/push";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import type { AppSession, Profile } from "../../lib/types";

type AuthValue = {
  session: Session | null;
  appSession: AppSession | null;
  loading: boolean;
  recoverySession: boolean;
  sessionError: string;
  signOut: () => Promise<void>;
  refreshAppSession: () => Promise<void>;
  has: (key: string) => boolean;
};
const AuthContext = createContext<AuthValue | null>(null);

type OnboardingState = {
  required: boolean;
  completed_at: string | null;
  eligible: boolean;
};

type ProductTourState = OnboardingState & {
  current_step: number;
  version: number;
  deferred_until: string | null;
};

const fetchAppSession = async (): Promise<AppSession | null> => {
  const [
    profileResult,
    permissionsResult,
    onboardingResult,
    productTourResult,
  ] = await Promise.all([
    supabase.rpc("get_my_profile").maybeSingle(),
    supabase.rpc("my_permissions"),
    supabase.rpc("get_my_onboarding_state").maybeSingle(),
    supabase.rpc("get_my_product_tour_state").maybeSingle(),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (permissionsResult.error) throw permissionsResult.error;
  if (onboardingResult.error) throw onboardingResult.error;
  if (productTourResult.error) throw productTourResult.error;
  if (!profileResult.data) return null;
  const onboarding = onboardingResult.data as OnboardingState | null;
  const productTour = productTourResult.data as ProductTourState | null;
  return {
    profile: profileResult.data as Profile,
    permissions: (permissionsResult.data ?? []).map(
      (permission: { permission_key: string }) => permission.permission_key,
    ),
    onboarding: {
      required: Boolean(onboarding?.required),
      eligible: Boolean(onboarding?.eligible),
      completedAt: onboarding?.completed_at ?? null,
    },
    productTour: {
      required: Boolean(productTour?.required),
      eligible: Boolean(productTour?.eligible),
      completedAt: productTour?.completed_at ?? null,
      currentStep: Number(productTour?.current_step ?? 0),
      version: Number(productTour?.version ?? 0),
      deferredUntil: productTour?.deferred_until ?? null,
    },
  };
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null>(null);
  const hydrationGeneration = useRef(0);
  const lastAppSession = useRef<AppSession | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [appSession, setAppSession] = useState<AppSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoverySession, setRecoverySession] = useState(false);
  const applyAppSession = useCallback(
    (next: AppSession | null) => {
      const previous = lastAppSession.current;
      if (
        previous &&
        (previous.profile.id !== next?.profile.id ||
          previous.profile.organization_id !== next?.profile.organization_id ||
          previous.profile.status !== next?.profile.status ||
          [...previous.permissions].sort().join(",") !==
            [...(next?.permissions ?? [])].sort().join(","))
      ) {
        queryClient.clear();
      }
      lastAppSession.current = next;
      setAppSession(next);
    },
    [queryClient],
  );
  useEffect(() => {
    let active = true;
    const hydrate = async (next: Session | null, event?: string) => {
      const generation = ++hydrationGeneration.current;
      const nextUserId = next?.user.id ?? null;
      if (previousUserId.current && previousUserId.current !== nextUserId) {
        queryClient.clear();
        applyAppSession(null);
        setRecoverySession(false);
      }
      if (event === "PASSWORD_RECOVERY") setRecoverySession(true);
      if (event === "SIGNED_OUT") setRecoverySession(false);
      previousUserId.current = nextUserId;
      setSession(next);
      setSessionError("");
      if (!next) {
        applyAppSession(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const hydratedAppSession = await fetchAppSession();
        if (!active || generation !== hydrationGeneration.current) return;
        applyAppSession(hydratedAppSession);
        setLoading(false);
      } catch {
        if (!active || generation !== hydrationGeneration.current) return;
        setSessionError(
          "Kontodaten konnten nicht geladen werden. Prüfen Sie die Verbindung und versuchen Sie es erneut.",
        );
        applyAppSession(null);
        setLoading(false);
      }
    };
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        if (active) return hydrate(data.session);
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          setSessionError(
            "Die Sitzung konnte nicht sicher wiederhergestellt werden. Bitte öffnen Sie die App erneut.",
          );
        }
      });
    const { data } = supabase.auth.onAuthStateChange(
      (event, next) => void hydrate(next, event),
    );
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [applyAppSession, queryClient]);

  const refreshAppSession = useCallback(async () => {
    if (!session) {
      applyAppSession(null);
      return;
    }
    const generation = ++hydrationGeneration.current;
    setLoading(true);
    try {
      const hydratedAppSession = await fetchAppSession();
      if (generation !== hydrationGeneration.current) return;
      applyAppSession(hydratedAppSession);
      setSessionError("");
      setLoading(false);
    } catch (error) {
      if (generation === hydrationGeneration.current) setLoading(false);
      throw error;
    }
  }, [applyAppSession, session]);

  useEffect(() => {
    let active = true;
    let refreshing = false;
    const refreshPermissions = async () => {
      if (
        !previousUserId.current ||
        !lastAppSession.current ||
        refreshing ||
        document.visibilityState === "hidden"
      )
        return;
      refreshing = true;
      const generation = hydrationGeneration.current;
      try {
        const next = await fetchAppSession();
        if (!active || generation !== hydrationGeneration.current) return;
        applyAppSession(next);
      } catch {
        // A transient network failure keeps the current UI; every write is
        // still authorized by the database using the current role assignments.
      } finally {
        refreshing = false;
      }
    };
    const refresh = () => void refreshPermissions();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(interval);
    };
  }, [applyAppSession]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      appSession,
      loading,
      recoverySession,
      sessionError,
      signOut: async () => {
        setSessionError("");
        try {
          await disablePush();
          const { error } = await supabase.auth.signOut({ scope: "local" });
          if (error) throw error;
          queryClient.clear();
        } catch {
          setSessionError(
            "Abmelden konnte nicht vollständig abgeschlossen werden. Bitte stellen Sie eine Verbindung her und versuchen Sie es erneut.",
          );
        }
      },
      refreshAppSession,
      has: (key) => Boolean(appSession?.permissions.includes(key)),
    }),
    [
      session,
      appSession,
      loading,
      recoverySession,
      sessionError,
      refreshAppSession,
      queryClient,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider fehlt");
  return value;
};
