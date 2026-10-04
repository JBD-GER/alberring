// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageSafetyActions, safetyError } from "./Safety";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ has: () => false }),
}));
let client: QueryClient;
beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
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
      <MessageSafetyActions
        messageId="message-a"
        senderId="person-b"
        senderName="Sam Muster"
      />
    </QueryClientProvider>,
  );
}
describe("message safety", () => {
  it("does not disclose a private message until the user confirms a report", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Melden" }));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Andere private Nachrichten werden nicht geteilt/),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Grund der Meldung"), {
      target: { value: "Belästigende Nachricht" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Meldung absenden" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("report_message", {
        p_message_id: "message-a",
        p_reason: "Belästigende Nachricht",
      }),
    );
    await screen.findByRole("status");
  });
  it("cancelling a block has no side effect", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Person blockieren" }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("blocks the selected sender only after confirmation", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Person blockieren" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Blockierung bestätigen" }),
    );
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("set_message_block", {
        p_profile_id: "person-b",
        p_blocked: true,
      }),
    );
  });
  it("keeps a failed report available for retry instead of showing success", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "permission_denied" } });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Melden" }));
    fireEvent.change(screen.getByLabelText("Grund der Meldung"), {
      target: { value: "Testmeldung" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Meldung absenden" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("explains blocked contact and content decisions without exposing internals", () => {
    expect(
      safetyError({ message: "message_contact_blocked" }, "Fallback"),
    ).toContain("Blockierung");
    expect(
      safetyError({ message: "message_content_not_allowed" }, "Fallback"),
    ).toContain("respektvoll");
    expect(safetyError({ message: "private database path" }, "Fallback")).toBe(
      "Fallback",
    );
  });
});
