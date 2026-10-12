// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  signed: vi.fn(),
  authenticated: false,
  active: true,
}));
vi.mock("../../lib/supabase", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: state.signed }) } },
}));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    session: state.authenticated ? { user: { id: "employee" } } : null,
    appSession: {
      profile: { status: state.active ? "active" : "suspended" },
      onboarding: { required: true },
    },
    loading: false,
    signOut: vi.fn(),
  }),
}));
import AndroidDownload, { androidRelease } from "./AndroidDownload";
import { ProtectedRoute } from "../../app/ProtectedRoute";
beforeEach(() => {
  state.authenticated = false;
  state.active = true;
  state.signed
    .mockReset()
    .mockResolvedValue({ data: null, error: new Error("denied") });
});
afterEach(cleanup);
function show() {
  render(
    <MemoryRouter initialEntries={["/android"]}>
      <Routes>
        <Route path="/login" element={<h1>Anmeldung erforderlich</h1>} />
        <Route element={<ProtectedRoute requireOnboarding={false} />}>
          <Route path="/android" element={<AndroidDownload />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
it("requires an employee login before requesting a binary", () => {
  show();
  expect(screen.getByText("Anmeldung erforderlich")).toBeVisible();
  expect(state.signed).not.toHaveBeenCalled();
});
it("rejects a suspended employee even with an authenticated session", () => {
  state.authenticated = true;
  state.active = false;
  show();
  expect(screen.getByText("Zugang nicht verfügbar")).toBeVisible();
  expect(state.signed).not.toHaveBeenCalled();
});
it("allows active employees to download before onboarding and reports failures", async () => {
  state.authenticated = true;
  show();
  fireEvent.click(
    screen.getByRole("button", { name: "Android-App herunterladen" }),
  );
  expect(state.signed).toHaveBeenCalledWith(
    `android/${androidRelease.filename}`,
    120,
    { download: androidRelease.filename },
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Download konnte nicht gestartet",
  );
  expect(
    screen.getByRole("button", { name: "Android-App herunterladen" }),
  ).toBeEnabled();
});
