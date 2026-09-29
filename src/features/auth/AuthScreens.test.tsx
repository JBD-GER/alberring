// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  update: vi.fn(),
  verify: vi.fn(),
  signOut: vi.fn(),
  requestReset: vi.fn(),
  refreshSession: vi.fn(),
  refreshAppSession: vi.fn(),
  activateProfile: vi.fn(),
  disablePush: vi.fn(),
  recoverySession: true,
  invited: false,
  sessionId: null as string | null,
  loading: false,
  sessionError: "",
}));
vi.mock("../../lib/supabase", () => ({
  supabase: {
    auth: {
      updateUser: state.update,
      verifyOtp: state.verify,
      signOut: state.signOut,
      resetPasswordForEmail: state.requestReset,
      refreshSession: state.refreshSession,
    },
    rpc: state.activateProfile,
  },
}));
vi.mock("../../services/platform/links", () => ({
  authRedirect: async (path: string) => `https://app.example${path}`,
}));
vi.mock("../../services/platform/push", () => ({
  disablePush: state.disablePush,
}));
vi.mock("./AuthProvider", () => ({
  useAuth: () => ({
    recoverySession: state.recoverySession,
    loading: state.loading,
    sessionError: state.sessionError,
    session:
      state.sessionId || state.invited
        ? { user: { id: state.sessionId ?? "invitee" } }
        : null,
    appSession: state.invited ? { profile: { status: "invited" } } : null,
    refreshAppSession: state.refreshAppSession,
  }),
}));
import { AcceptInvite, ForgotPassword, ResetPassword } from "./AuthScreens";
beforeEach(() => {
  state.recoverySession = true;
  state.invited = false;
  state.sessionId = null;
  state.loading = false;
  state.sessionError = "";
  state.verify.mockReset().mockResolvedValue({
    data: {
      session: {
        user: { id: "verified-user" },
        access_token: "verified-access",
      },
    },
    error: null,
  });
  state.update.mockReset().mockResolvedValue({ error: null });
  state.signOut.mockReset().mockResolvedValue({ error: null });
  state.requestReset.mockReset().mockResolvedValue({ error: null });
  state.refreshSession.mockReset().mockResolvedValue({ error: null });
  state.refreshAppSession.mockReset().mockResolvedValue(undefined);
  state.activateProfile.mockReset().mockResolvedValue({ error: null });
  state.disablePush.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);
function submitPassword() {
  render(
    <MemoryRouter>
      <ResetPassword />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("Neues Passwort"), {
    target: { value: "RecoveryPassword2026" },
  });
  fireEvent.change(screen.getByLabelText("Passwort wiederholen"), {
    target: { value: "RecoveryPassword2026" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Passwort speichern" }));
}
it("revokes push before global sign-out and reports success only afterwards", async () => {
  let finishRevoke!: () => void;
  state.disablePush.mockReturnValue(
    new Promise<void>((resolve) => {
      finishRevoke = resolve;
    }),
  );
  submitPassword();
  await waitFor(() => expect(state.disablePush).toHaveBeenCalledOnce());
  expect(state.signOut).not.toHaveBeenCalled();
  expect(screen.queryByRole("status")).toBeNull();
  finishRevoke();
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Passwort erfolgreich aktualisiert",
  );
  expect(state.signOut).toHaveBeenCalledWith({ scope: "global" });
});
it("failed push revocation keeps sign-out pending and retries without changing password twice", async () => {
  state.disablePush.mockRejectedValueOnce(new Error("network unavailable"));
  submitPassword();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "sichere Abmeldung konnte nicht abgeschlossen",
  );
  expect(screen.queryByRole("status")).toBeNull();
  expect(state.signOut).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Sichere Abmeldung erneut versuchen" }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Passwort erfolgreich aktualisiert",
  );
  expect(state.update).toHaveBeenCalledOnce();
  expect(state.disablePush).toHaveBeenCalledTimes(2);
});
it("SDK sign-out error is visible and cannot be mistaken for successful cleanup", async () => {
  state.signOut.mockResolvedValueOnce({
    error: new Error("network unavailable"),
  });
  submitPassword();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "sichere Abmeldung konnte nicht abgeschlossen",
  );
  expect(screen.queryByRole("link", { name: "Zur Anmeldung" })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Sichere Abmeldung erneut versuchen" }),
  );
  await screen.findByRole("status");
  expect(state.signOut).toHaveBeenCalledTimes(2);
  expect(state.update).toHaveBeenCalledOnce();
});
it("password update rejection leaves cleanup untouched and permits retry", async () => {
  state.update.mockRejectedValueOnce(new Error("network unavailable"));
  submitPassword();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Passwortänderung konnte nicht bestätigt",
  );
  expect(state.disablePush).not.toHaveBeenCalled();
  expect(state.signOut).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Passwort speichern" }),
  ).not.toBeDisabled();
});

function requestPasswordReset() {
  render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("Dienstliche E-Mail"), {
    target: { value: "employee@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Link anfordern" }));
}

it("reports mail rate limits and leaves a failed request retryable", async () => {
  state.requestReset.mockResolvedValueOnce({
    error: { code: "over_email_send_rate_limit", status: 429 },
  });
  requestPasswordReset();
  expect(await screen.findByRole("alert")).toHaveTextContent("Versandlimit");
  expect(screen.queryByRole("status")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Link anfordern" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Falls ein Konto zu dieser E-Mail-Adresse existiert",
  );
  expect(state.requestReset).toHaveBeenLastCalledWith("employee@example.com", {
    redirectTo: "https://app.example/reset-password",
  });
});

it("recovers from a rejected password reset request without showing success", async () => {
  state.requestReset.mockRejectedValueOnce(new Error("offline"));
  requestPasswordReset();
  expect(await screen.findByRole("alert")).toHaveTextContent("Verbindung");
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("button", { name: "Link anfordern" })).toBeEnabled();
});

it("offers a new link when the recovery session has expired", () => {
  state.recoverySession = false;
  render(
    <MemoryRouter>
      <ResetPassword />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("link", { name: "Neuen Link anfordern" }),
  ).toHaveAttribute("href", "/forgot-password");
  expect(
    screen.queryByRole("button", { name: "Passwort speichern" }),
  ).toBeNull();
});

function acceptInvite() {
  state.invited = true;
  render(
    <MemoryRouter initialEntries={["/accept-invite"]}>
      <Routes>
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/app/dashboard" element={<p>Konto geöffnet</p>} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("Neues Passwort"), {
    target: { value: "InvitationPassword2026" },
  });
  fireEvent.change(screen.getByLabelText("Passwort wiederholen"), {
    target: { value: "InvitationPassword2026" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Konto aktivieren" }));
}

it("releases the invite form after a network error while saving the password", async () => {
  state.update.mockRejectedValueOnce(new Error("offline"));
  acceptInvite();
  expect(await screen.findByRole("alert")).toHaveTextContent("Verbindung");
  expect(
    screen.getByRole("button", { name: "Konto aktivieren" }),
  ).toBeEnabled();
  expect(state.activateProfile).not.toHaveBeenCalled();
});

it("retries profile activation without saving an already changed password again", async () => {
  state.activateProfile.mockResolvedValueOnce({ error: new Error("offline") });
  acceptInvite();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Ihr Passwort wurde gespeichert",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Aktivierung erneut versuchen" }),
  );
  await screen.findByText("Konto geöffnet");
  expect(state.update).toHaveBeenCalledOnce();
  expect(state.activateProfile).toHaveBeenCalledTimes(2);
  expect(state.refreshAppSession).toHaveBeenCalledOnce();
});

it("does not enter the app until the activated account session has refreshed", async () => {
  state.refreshSession.mockResolvedValueOnce({ error: new Error("offline") });
  acceptInvite();
  await screen.findByRole("alert");
  expect(screen.queryByText("Konto geöffnet")).toBeNull();
  expect(state.refreshAppSession).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Aktivierung erneut versuchen" }),
  );
  await screen.findByText("Konto geöffnet");
  expect(state.activateProfile).toHaveBeenCalledOnce();
  expect(state.update).toHaveBeenCalledOnce();
  expect(state.refreshAppSession).toHaveBeenCalledOnce();
});

const emailToken = "b".repeat(64);

function CurrentLocation() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </div>
  );
}

function TokenLinkScreen({ entry }: { entry: string }) {
  return (
    <StrictMode>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
        <CurrentLocation />
      </MemoryRouter>
    </StrictMode>
  );
}

it.each([
  ["/accept-invite", "invite", "#", "Einladung öffnen"],
  ["/accept-invite", "recovery", "?", "Einladung öffnen"],
  ["/reset-password", "recovery", "#", "Link bestätigen"],
  ["/reset-password", "recovery", "?", "Link bestätigen"],
])(
  "requires an explicit click for %s %s %s even with an existing session",
  async (path, type, separator, button) => {
    state.sessionId = "old-user";
    state.invited = true;
    const entry = `${path}${separator}token_hash=${emailToken}&type=${type}`;
    const view = render(<TokenLinkScreen entry={entry} />);
    expect(state.verify).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Neues Passwort")).toBeNull();
    state.verify.mockImplementationOnce(async () => {
      state.sessionId = "verified-user";
      state.loading = true;
      return {
        data: {
          session: {
            user: { id: "verified-user" },
            access_token: "verified-access",
          },
        },
        error: null,
      };
    });
    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Kontodaten werden geladen",
    );
    expect(state.verify).toHaveBeenCalledExactlyOnceWith({
      token_hash: emailToken,
      type,
    });
    expect(screen.queryByLabelText("Neues Passwort")).toBeNull();
    expect(screen.getByTestId("location")).not.toHaveTextContent("token_hash=");
    state.loading = false;
    view.rerender(<TokenLinkScreen entry={entry} />);
    await screen.findByLabelText("Neues Passwort");
    expect(screen.getByTestId("location")).toHaveTextContent(path);
    expect(screen.getByTestId("location")).not.toHaveTextContent("token_hash");
    expect(state.update).not.toHaveBeenCalled();
  },
);

it("never opens the previous user's form while the verified session is catching up", async () => {
  state.sessionId = "old-user";
  state.invited = true;
  const entry = `/accept-invite?token_hash=${emailToken}&type=invite`;
  const view = render(<TokenLinkScreen entry={entry} />);
  fireEvent.click(screen.getByRole("button", { name: "Einladung öffnen" }));
  await screen.findByRole("alert");
  expect(screen.queryByLabelText("Neues Passwort")).toBeNull();
  state.sessionId = "verified-user";
  view.rerender(<TokenLinkScreen entry={entry} />);
  await screen.findByLabelText("Neues Passwort");
  expect(state.verify).toHaveBeenCalledOnce();
});

it("does not verify again when profile hydration needs a retry", async () => {
  state.verify.mockImplementationOnce(async () => {
    state.sessionId = "verified-user";
    state.sessionError = "Kontodaten konnten nicht geladen werden.";
    return {
      data: {
        session: {
          user: { id: "verified-user" },
          access_token: "verified-access",
        },
      },
      error: null,
    };
  });
  state.refreshAppSession.mockImplementationOnce(async () => {
    state.sessionError = "";
  });
  render(
    <TokenLinkScreen
      entry={`/reset-password#token_hash=${emailToken}&type=recovery`}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Link bestätigen" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Kontodaten");
  expect(screen.getByTestId("location")).not.toHaveTextContent(emailToken);
  fireEvent.click(
    screen.getByRole("button", { name: "Kontodaten erneut laden" }),
  );
  await screen.findByLabelText("Neues Passwort");
  expect(state.verify).toHaveBeenCalledOnce();
  expect(state.refreshAppSession).toHaveBeenCalledOnce();
});

it("keeps an expired link gated and never changes the old session's password", async () => {
  state.sessionId = "old-user";
  state.verify.mockResolvedValueOnce({
    data: { session: null },
    error: { code: "otp_expired" },
  });
  render(
    <TokenLinkScreen
      entry={`/reset-password?token_hash=${emailToken}&type=recovery`}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Link bestätigen" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("neue E-Mail");
  expect(screen.queryByLabelText("Neues Passwort")).toBeNull();
  expect(state.update).not.toHaveBeenCalled();
});

it("rejects successful verification responses without a usable session", async () => {
  state.verify.mockResolvedValueOnce({ data: { session: null }, error: null });
  render(
    <TokenLinkScreen
      entry={`/reset-password?token_hash=${emailToken}&type=recovery`}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Link bestätigen" }));
  await screen.findByRole("alert");
  expect(screen.queryByLabelText("Neues Passwort")).toBeNull();
});

it("rejects an invitation token on the reset page before contacting Supabase", () => {
  render(
    <TokenLinkScreen
      entry={`/reset-password?token_hash=${emailToken}&type=invite`}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("ungültig");
  expect(screen.queryByRole("button", { name: "Link bestätigen" })).toBeNull();
  expect(state.verify).not.toHaveBeenCalled();
});

it("ignores repeated clicks while verification is pending", async () => {
  let finish!: (value: unknown) => void;
  state.verify.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(
    <TokenLinkScreen
      entry={`/reset-password?token_hash=${emailToken}&type=recovery`}
    />,
  );
  const button = screen.getByRole("button", { name: "Link bestätigen" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(state.verify).toHaveBeenCalledOnce();
  finish({ data: { session: null }, error: new Error("offline") });
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Link bestätigen" })).toBeEnabled();
});

it("waits for the recovery event before exposing the reset form", async () => {
  state.recoverySession = false;
  state.verify.mockImplementationOnce(async () => {
    state.sessionId = "verified-user";
    state.loading = true;
    return {
      data: {
        session: {
          user: { id: "verified-user" },
          access_token: "verified-access",
        },
      },
      error: null,
    };
  });
  const entry = `/reset-password?token_hash=${emailToken}&type=recovery&redirect_to=https://untrusted.example`;
  const view = render(<TokenLinkScreen entry={entry} />);
  fireEvent.click(screen.getByRole("button", { name: "Link bestätigen" }));
  await screen.findByRole("status");
  expect(screen.queryByLabelText("Neues Passwort")).toBeNull();
  state.recoverySession = true;
  state.loading = false;
  view.rerender(<TokenLinkScreen entry={entry} />);
  await screen.findByLabelText("Neues Passwort");
  expect(screen.getByTestId("location")).toHaveTextContent(
    /^\/reset-password$/,
  );
});

it("shows a lost-session error instead of waiting forever after verification", async () => {
  state.verify.mockImplementationOnce(async () => {
    state.sessionId = "verified-user";
    state.loading = true;
    return {
      data: {
        session: {
          user: { id: "verified-user" },
          access_token: "verified-access",
        },
      },
      error: null,
    };
  });
  const entry = `/reset-password#token_hash=${emailToken}&type=recovery`;
  const view = render(<TokenLinkScreen entry={entry} />);
  fireEvent.click(screen.getByRole("button", { name: "Link bestätigen" }));
  await screen.findByRole("status");
  state.sessionId = null;
  state.loading = false;
  view.rerender(<TokenLinkScreen entry={entry} />);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Sitzung ist nicht verfügbar",
  );
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByLabelText("Neues Passwort")).toBeNull();
  expect(screen.getByTestId("location")).not.toHaveTextContent(emailToken);
});

it.each([
  [
    "/reset-password#access_token=legacy&refresh_token=old&type=recovery",
    false,
  ],
  ["/accept-invite#access_token=legacy&refresh_token=old&type=invite", true],
])(
  "preserves the established ConfirmationURL session flow for %s",
  (entry, invited) => {
    state.invited = invited;
    render(<TokenLinkScreen entry={entry} />);
    expect(screen.getByLabelText("Neues Passwort")).toBeInTheDocument();
    expect(state.verify).not.toHaveBeenCalled();
  },
);

it("permits another explicit attempt after a network rejection", async () => {
  state.verify.mockRejectedValueOnce(new Error("offline"));
  render(
    <TokenLinkScreen
      entry={`/reset-password?token_hash=${emailToken}&type=recovery`}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Link bestätigen" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Link bestätigen" })).toBeEnabled();
  expect(screen.getByTestId("location")).toHaveTextContent(emailToken);
  expect(screen.queryByLabelText("Neues Passwort")).toBeNull();
});
