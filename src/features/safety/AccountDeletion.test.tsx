// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccountDeletion } from "./AccountDeletion";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), order: vi.fn() }));
vi.mock("../../lib/supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ order: mocks.order }) }),
  },
}));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    appSession: { profile: { id: "mine" } },
    has: () => false,
  }),
}));
let client: QueryClient;
beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ error: null });
  mocks.order.mockReset().mockResolvedValue({ data: [], error: null });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
});
function mount() {
  render(
    <QueryClientProvider client={client}>
      <AccountDeletion />
    </QueryClientProvider>,
  );
}
it("states the deadline and requires explicit confirmation before requesting deletion", async () => {
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Löschung beantragen" }),
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(screen.getByText(/innerhalb von 7 Tagen/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
  expect(mocks.rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Löschung beantragen" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Löschantrag verbindlich absenden" }),
  );
  await waitFor(() =>
    expect(mocks.rpc).toHaveBeenCalledWith("request_account_deletion"),
  );
  expect(await screen.findByRole("status")).toBeTruthy();
});
it("never shows successful submission when persistence fails", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "network unavailable" } });
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Löschung beantragen" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Löschantrag verbindlich absenden" }),
  );
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
});
it("shows the stored request deadline and hides a duplicate submission", async () => {
  mocks.order.mockResolvedValue({
    data: [
      {
        id: "request",
        profile_id: "mine",
        contact_email: "review@example.test",
        requested_at: "2026-10-04T12:00:00Z",
        due_at: "2026-10-11T12:00:00Z",
        status: "requested",
      },
    ],
    error: null,
  });
  mount();
  expect((await screen.findByRole("status")).textContent).toContain(
    "11.10.2026",
  );
  expect(
    screen.queryByRole("button", { name: "Löschung beantragen" }),
  ).toBeNull();
});
