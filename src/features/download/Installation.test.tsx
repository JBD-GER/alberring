// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ status: "active", signedIn: false }));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    session: state.signedIn ? { user: { id: "employee" } } : null,
    appSession: {
      profile: { status: state.status },
      onboarding: { required: true },
    },
    loading: false,
    signOut: vi.fn(),
  }),
}));
import Installation from "./Installation";
import { ProtectedRoute } from "../../app/ProtectedRoute";
afterEach(cleanup);
function show(signedIn: boolean, status = "active") {
  state.signedIn = signedIn;
  state.status = status;
  render(
    <MemoryRouter initialEntries={["/installation"]}>
      <Routes>
        <Route path="/login" element={<h1>Anmeldung erforderlich</h1>} />
        <Route element={<ProtectedRoute requireOnboarding={false} />}>
          <Route path="/installation" element={<Installation />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
it("does not expose installation choices without a login", () => {
  show(false);
  expect(screen.getByText("Anmeldung erforderlich")).toBeVisible();
  expect(screen.queryByRole("link", { name: /installieren/i })).toBeNull();
});
it.each(["invited", "suspended"])("denies choices to %s profiles", (status) => {
  show(true, status);
  expect(screen.getByText("Zugang nicht verfügbar")).toBeVisible();
  expect(screen.queryByRole("link", { name: /Android/ })).toBeNull();
});
it("offers active employees browser and Android while Apple approval is pending", () => {
  show(true);
  expect(
    screen.getByRole("link", { name: "Webanwendung öffnen" }),
  ).toHaveAttribute("href", "/app/dashboard");
  expect(
    screen.getByRole("link", { name: "Android-App installieren" }),
  ).toHaveAttribute("href", "/android");
  expect(screen.getByText(/wartet noch auf Apples Freigabe/)).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Im App Store öffnen" }),
  ).toBeNull();
});
