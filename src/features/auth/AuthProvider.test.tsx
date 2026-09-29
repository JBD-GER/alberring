// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthProvider";

const state = vi.hoisted(() => ({
  permissions: ["messages.use", "roles.manage"],
  authEvent: null as null | ((event: string, session: unknown) => void),
  requests: [] as string[],
  listRequests: vi.fn(),
}));
vi.mock("../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "admin" } } },
      }),
      onAuthStateChange: (
        callback: (event: string, session: unknown) => void,
      ) => {
        state.authEvent = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    rpc: (name: string) => {
      if (name === "my_permissions")
        return Promise.resolve({
          data: state.permissions.map((permission_key) => ({ permission_key })),
          error: null,
        });
      return {
        maybeSingle: async () => ({
          data:
            name === "get_my_profile"
              ? { id: "admin", status: "active", display_name: "Admin" }
              : { required: false, eligible: false },
          error: null,
        }),
      };
    },
  },
}));

function PermissionView() {
  const { has, loading, appSession, refreshAppSession } = useAuth();
  const requests = useQuery({
    queryKey: ["leave-requests"],
    queryFn: state.listRequests,
    enabled: Boolean(appSession),
    staleTime: Infinity,
  });
  return (
    <div>
      {loading
        ? "Lädt"
        : has("roles.manage")
          ? "Rollen verwalten"
          : "Keine Rollenverwaltung"}
      <button onClick={() => void refreshAppSession()}>
        Rechte aktualisieren
      </button>
      {requests.data?.map((request: string) => (
        <p key={request}>{request}</p>
      ))}
    </div>
  );
}

beforeEach(() => {
  state.permissions = ["messages.use", "roles.manage"];
  state.authEvent = null;
  state.requests = [];
  state.listRequests.mockReset().mockImplementation(async () => state.requests);
});

it.each(["focus", "auth", "manual"])(
  "lädt sichtbare Urlaubsanträge nach neuer Freigaberolle erneut (%s)",
  async (trigger) => {
    state.permissions = ["leave.view_own"];
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <PermissionView />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await screen.findByText("Keine Rollenverwaltung");
    await waitFor(() => expect(state.listRequests).toHaveBeenCalledTimes(1));
    state.permissions = ["leave.view_own", "leave.manage", "roles.manage"];
    state.requests = ["Urlaubsantrag des Teams"];
    if (trigger === "focus") fireEvent.focus(window);
    else if (trigger === "auth") {
      await act(async () =>
        state.authEvent?.("TOKEN_REFRESHED", { user: { id: "admin" } }),
      );
    } else
      fireEvent.click(
        screen.getByRole("button", { name: "Rechte aktualisieren" }),
      );
    await screen.findByText("Rollen verwalten");
    await screen.findByText("Urlaubsantrag des Teams");
    expect(state.listRequests).toHaveBeenCalledTimes(2);
  },
);
afterEach(cleanup);

it("übernimmt geänderte Rollen beim Zurückkehren und entfernt veraltete Daten", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <PermissionView />
      </AuthProvider>
    </QueryClientProvider>,
  );
  await screen.findByText("Rollen verwalten");
  client.setQueryData(["admin-users"], [{ id: "private-user" }]);
  state.permissions = ["messages.use"];
  fireEvent.focus(window);
  await screen.findByText("Keine Rollenverwaltung");
  expect(client.getQueryData(["admin-users"])).toBeUndefined();
  state.permissions = ["messages.use", "roles.manage"];
  fireEvent.focus(window);
  await waitFor(() =>
    expect(screen.getByText("Rollen verwalten")).toBeTruthy(),
  );
});
