import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import type { AppSession, Profile } from "../../lib/types";

type AuthValue = {
  session: Session | null;
  appSession: AppSession | null;
  loading: boolean;
  recoverySession: boolean;
  signOut: () => Promise<void>;
  has: (key: string) => boolean;
};
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null>(null);
  const hydrationGeneration = useRef(0);
  const [session, setSession] = useState<Session | null>(null);
  const [appSession, setAppSession] = useState<AppSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoverySession, setRecoverySession] = useState(false);
  useEffect(() => {
    let active = true;
    const hydrate = async (next: Session | null, event?: string) => {
      const generation = ++hydrationGeneration.current;
      const nextUserId = next?.user.id ?? null;
      if (previousUserId.current && previousUserId.current !== nextUserId) {
        queryClient.clear();
        setAppSession(null);
        setRecoverySession(false);
      }
      if (event === "PASSWORD_RECOVERY") setRecoverySession(true);
      if (event === "SIGNED_OUT") setRecoverySession(false);
      previousUserId.current = nextUserId;
      setSession(next);
      if (!next) {
        setAppSession(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const [{ data: profile }, { data: permissions }] = await Promise.all([
        supabase.rpc("get_my_profile").maybeSingle(),
        supabase.rpc("my_permissions"),
      ]);
      if (!active || generation !== hydrationGeneration.current) return;
      setAppSession(
        profile
          ? {
              profile: profile as Profile,
              permissions: (permissions ?? []).map(
                (p: { permission_key: string }) => p.permission_key,
              ),
            }
          : null,
      );
      setLoading(false);
    };
    void supabase.auth.getSession().then(({ data }) => hydrate(data.session));
    const { data } = supabase.auth.onAuthStateChange(
      (event, next) => void hydrate(next, event),
    );
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);
  const value = useMemo<AuthValue>(
    () => ({
      session,
      appSession,
      loading,
      recoverySession,
      signOut: async () => {
        await supabase.auth.signOut();
      },
      has: (key) => Boolean(appSession?.permissions.includes(key)),
    }),
    [session, appSession, loading, recoverySession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider fehlt");
  return value;
};
