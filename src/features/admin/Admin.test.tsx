// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { AdminRoles, AdminTeams, AdminUserDetail, AdminUsers } from "./Admin";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  invoke: vi.fn(),
  has: vi.fn<(permission: string) => boolean>(() => true),
  refreshAppSession: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
    functions: { invoke: mocks.invoke },
  },
}));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    appSession: { profile: { id: "manager", organization_id: "org" } },
    has: mocks.has,
    refreshAppSession: mocks.refreshAppSession,
  }),
}));

const roles = [
  { id: "super", name: "Super Admin", system_key: "super_admin" },
  { id: "admin", name: "Teamleitung", system_key: "team_lead" },
  { id: "employee", name: "Mitarbeiter", system_key: "employee" },
];

function setup(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/admin/users" element={<AdminUsers />} />
          <Route
            path="/app/admin/users/:userId"
            element={<AdminUserDetail />}
          />
          <Route path="/app/admin/teams" element={<AdminTeams />} />
          <Route path="/app/admin/roles" element={<AdminRoles />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

async function submitNewInvitation() {
  fireEvent.click(screen.getByRole("button", { name: "Mitarbeiter einladen" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Vorname" }), {
    target: { value: "Eva" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Nachname" }), {
    target: { value: "Beispiel" },
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: "Dienstliche E-Mail" }),
    {
      target: { value: "eva@example.test" },
    },
  );
  await screen.findByRole("option", { name: "Mitarbeiter" });
  fireEvent.change(screen.getByRole("combobox", { name: "Rolle" }), {
    target: { value: "employee" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sicher einladen" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mocks.has.mockReturnValue(true);
  mocks.invoke.mockResolvedValue({
    data: { delivery: "email", sent: true },
    error: null,
  });
  Element.prototype.scrollIntoView = vi.fn();
  const users = [
    {
      id: "manager",
      display_name: "Mara Admin",
      email: "mara@example.test",
      first_name: "Mara",
      last_name: "Admin",
      employment_status: "active",
      status: "active",
      job_title: null,
      roles: [roles[0]],
      teams: [],
    },
    {
      id: "bob",
      display_name: "Bob Neu",
      email: "bob@example.test",
      first_name: "Bob",
      last_name: "Neu",
      employment_status: "active",
      status: "invited",
      job_title: null,
      roles: [roles[2]],
      teams: [],
    },
    {
      id: "alice",
      display_name: "Alice Müller",
      email: "alice@example.test",
      first_name: "Alice",
      last_name: "Müller",
      employment_status: "active",
      status: "active",
      job_title: null,
      roles: [roles[2]],
      teams: [],
    },
  ];
  const people = [
    {
      id: "alice",
      display_name: "Alice Müller",
      email: "alice@example.test",
      status: "active",
      team_ids: ["team-a"],
    },
    {
      id: "bob",
      display_name: "Bob Neu",
      email: "bob@example.test",
      status: "invited",
      team_ids: [],
    },
    {
      id: "suspended",
      display_name: "Sam Pause",
      email: "sam@example.test",
      status: "suspended",
      team_ids: ["team-a"],
    },
  ];
  mocks.from.mockImplementation((table: string) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data:
          table === "roles"
            ? [
                ...roles.map((role) => ({ ...role, role_permissions: [] })),
                {
                  id: "custom",
                  name: "Veraltete Sonderrolle",
                  system_key: null,
                  role_permissions: [],
                },
              ]
            : [
                {
                  id: "team-a",
                  name: "Pflege Nord",
                  location_name: null,
                  active: true,
                  locations: null,
                  profiles: null,
                },
              ],
        error: null,
      }),
    };
    return chain;
  });
  mocks.rpc.mockImplementation(
    async (name: string, args?: Record<string, unknown>) => {
      if (name === "admin_list_users")
        return { data: structuredClone(users), error: null };
      if (name === "admin_list_team_members")
        return { data: structuredClone(people), error: null };
      if (name === "set_user_roles") {
        const user = users.find((entry) => entry.id === args?.p_profile_id);
        if (user)
          user.roles = roles.filter((role) =>
            (args?.p_role_ids as string[]).includes(role.id),
          );
      }
      return { data: name === "create_team" ? "new-team" : null, error: null };
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("open employee invitations", () => {
  it("makes resending discoverable and calls the invitation endpoint for the selected employee", async () => {
    setup("/app/admin/users");
    const resend = await screen.findByRole("button", {
      name: "Einladung an Bob Neu erneut senden",
    });
    expect(resend).toHaveTextContent("Einladung erneut senden");
    fireEvent.click(resend);
    await screen.findByText("Einladung wurde erneut versendet.");
    expect(mocks.invoke).toHaveBeenCalledWith("admin-resend-invite", {
      body: { profileId: "bob" },
    });
    expect(
      screen.queryByRole("button", { name: /Einladung an Alice/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a manual invitation link when automatic delivery is unavailable", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        delivery: "manual_link",
        sent: false,
        manualInviteUrl: "https://example.test/accept-invite?token=one-time",
        warning: {
          message: "Der automatische E-Mail-Versand ist nicht verfügbar.",
        },
      },
      error: null,
    });
    setup("/app/admin/users");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Einladung an Bob Neu erneut senden",
      }),
    );
    expect(
      await screen.findByRole("textbox", { name: "Einmaliger Einladungslink" }),
    ).toHaveValue("https://example.test/accept-invite?token=one-time");
    expect(
      screen.queryByText("Einladung wurde erneut versendet."),
    ).not.toBeInTheDocument();
  });

  it("explains the 24-hour lifetime after sending and shows the notice again unless dismissed permanently", async () => {
    setup("/app/admin/users");
    const resend = await screen.findByRole("button", {
      name: "Einladung an Bob Neu erneut senden",
    });
    fireEvent.click(resend);
    expect(
      await screen.findByRole("dialog", {
        name: "Einladungslink: 24 Stunden gültig",
      }),
    ).toHaveTextContent("kann nur einmal verwendet werden");
    expect(
      screen.getByRole("checkbox", { name: "Nicht mehr anzeigen" }),
    ).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Verstanden" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(resend);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("remembers the notice preference after a new invitation and respects it when resending after reloading", async () => {
    setup("/app/admin/users");
    await submitNewInvitation();
    await screen.findByRole("dialog");
    expect(mocks.invoke).toHaveBeenCalledWith("admin-create-user", {
      body: {
        firstName: "Eva",
        lastName: "Beispiel",
        email: "eva@example.test",
        roleId: "employee",
        teamId: undefined,
      },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Nicht mehr anzeigen" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Verstanden" }));
    cleanup();
    setup("/app/admin/users");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Einladung an Bob Neu erneut senden",
      }),
    );
    await screen.findByText("Einladung wurde erneut versendet.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Der Einladungslink ist 24 Stunden gültig/),
    ).toBeInTheDocument();
  });

  it("keeps a failed delivery visible without claiming success or showing an expiry notice", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        error: {
          message: "Die Einladungs-E-Mail konnte nicht versendet werden.",
        },
      },
      error: null,
    });
    setup("/app/admin/users");
    const resend = await screen.findByRole("button", {
      name: "Einladung an Bob Neu erneut senden",
    });
    fireEvent.click(resend);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Einladungs-E-Mail konnte nicht versendet werden.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Einladung wurde erneut versendet."),
    ).not.toBeInTheDocument();
    expect(resend).toBeEnabled();
  });

  it.each([null, {}, { delivery: "email", sent: false }, { sent: false }])(
    "does not claim email success for an unconfirmed delivery response (%j)",
    async (data) => {
      mocks.invoke.mockResolvedValue({ data, error: null });
      setup("/app/admin/users");
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Einladung an Bob Neu erneut senden",
        }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Der E-Mail-Versand wurde nicht bestätigt.",
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Einladung wurde erneut versendet."),
      ).not.toBeInTheDocument();
    },
  );

  it("shows a saved employee and allows resending when the initial email delivery failed", async () => {
    let created = false;
    const defaultRpc = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation(
      async (name: string, args?: Record<string, unknown>) => {
        const result = await defaultRpc(name, args);
        if (name === "admin_list_users" && created)
          result.data.push({
            ...result.data[1],
            id: "eva",
            display_name: "Eva Beispiel",
            email: "eva@example.test",
          });
        return result;
      },
    );
    mocks.invoke.mockImplementation(async (name: string) => {
      if (name === "admin-create-user") {
        created = true;
        return {
          data: { profileId: "eva", delivery: "failed", sent: false },
          error: null,
        };
      }
      return { data: { delivery: "email", sent: true }, error: null };
    });
    setup("/app/admin/users");
    await submitNewInvitation();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Der Benutzer wurde angelegt, aber die Einladungs-E-Mail konnte nicht versendet werden.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Einladung an Eva Beispiel erneut senden",
      }),
    );
    await screen.findByText("Einladung wurde erneut versendet.");
    expect(mocks.invoke).toHaveBeenCalledWith("admin-resend-invite", {
      body: { profileId: "eva" },
    });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("does not block the invitation when browser storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage disabled");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage disabled");
    });
    setup("/app/admin/users");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Einladung an Bob Neu erneut senden",
      }),
    );
    await screen.findByRole("dialog");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Nicht mehr anzeigen" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Verstanden" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByText("Einladung wurde erneut versendet."),
    ).toBeInTheDocument();
  });

  it("cancels deleting an invitation without calling the server", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    setup("/app/admin/users");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Benutzer Bob Neu löschen",
      }),
    );
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("Bob Neu (bob@example.test) endgültig löschen?"),
    );
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("deletes only after confirmation and refreshes the employee list", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    setup("/app/admin/users");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Benutzer Bob Neu löschen",
      }),
    );
    await screen.findByText(
      "Der Benutzer wurde gelöscht. Vorhandene Vorgänge bleiben als „Gelöschter Benutzer“ erhalten.",
    );
    expect(mocks.invoke).toHaveBeenCalledWith("admin-delete-user", {
      body: { profileId: "bob" },
    });
    await waitFor(() =>
      expect(
        mocks.rpc.mock.calls.filter(([name]) => name === "admin_list_users"),
      ).toHaveLength(2),
    );
    expect(
      screen.getByRole("button", { name: /Benutzer Alice Müller löschen/ }),
    ).toBeInTheDocument();
  });

  it("explains a protected account and preserves it after rejected deletion", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.invoke.mockResolvedValue({
      data: {
        error: {
          message: "Mindestens ein aktiver Super Admin muss erhalten bleiben.",
        },
      },
      error: null,
    });
    setup("/app/admin/users");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Benutzer Bob Neu löschen",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Mindestens ein aktiver Super Admin muss erhalten bleiben.",
    );
    expect(screen.getByRole("link", { name: "Bob Neu" })).toBeInTheDocument();
  });

  it("hides invitation and deletion actions from administrators with read-only access", async () => {
    mocks.has.mockImplementation(
      (permission?: string) => permission === "users.view",
    );
    setup("/app/admin/users");
    await screen.findByRole("link", { name: "Bob Neu" });
    expect(
      screen.queryByRole("button", {
        name: /erneut senden|Benutzer .* löschen/,
      }),
    ).not.toBeInTheDocument();
  });
});

describe("administrative role and team workflows", () => {
  it("limits role administration to the three supported roles without custom role creation", async () => {
    setup("/app/admin/roles");
    await screen.findByRole("heading", { name: "Super Admin" });
    expect(
      screen.getByRole("heading", { name: "Teamleitung" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Mitarbeiter" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Veraltete Sonderrolle")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Rolle anlegen" }),
    ).not.toBeInTheDocument();
  });

  it("makes role editing discoverable and saves a complete replacement including Super Admin", async () => {
    setup("/app/admin/users");
    const links = await screen.findAllByRole("link", { name: "Rollen ändern" });
    fireEvent.click(
      links.find((link) => link.getAttribute("href")?.includes("alice"))!,
    );
    fireEvent.click(
      await screen.findByRole("checkbox", { name: /^Mitarbeiter/ }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /^Super Admin/ }));
    expect(
      mocks.rpc.mock.calls.some(([name]) => name === "set_user_roles"),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Rollen speichern" }));
    await screen.findByText("Rollen gespeichert.");
    expect(mocks.rpc).toHaveBeenCalledWith("set_user_roles", {
      p_profile_id: "alice",
      p_role_ids: ["super"],
    });
    expect(
      screen.getByRole("checkbox", { name: /^Super Admin/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /^Mitarbeiter/ }),
    ).not.toBeChecked();
  });

  it("keeps role changes available after a rejected save and explains the protected last Super Admin", async () => {
    const defaultRpc = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation(
      (name: string, args?: Record<string, unknown>) =>
        name === "set_user_roles"
          ? Promise.resolve({
              data: null,
              error: { message: "last_super_admin_role_cannot_be_removed" },
            })
          : defaultRpc(name, args),
    );
    setup("/app/admin/users/manager");
    fireEvent.click(
      await screen.findByRole("checkbox", { name: /^Super Admin/ }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /^Teamleitung/ }));
    fireEvent.click(screen.getByRole("button", { name: "Rollen speichern" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Mindestens ein aktiver Super Admin muss erhalten bleiben.",
    );
    expect(
      screen.getByRole("button", { name: "Rollen speichern" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("checkbox", { name: /^Teamleitung/ }),
    ).toBeChecked();
  });

  it("creates a team with active and invited members while retaining selection across searches", async () => {
    setup("/app/admin/teams");
    fireEvent.click(screen.getByRole("button", { name: "Team anlegen" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Teamname" }), {
      target: { value: "Frühdienst" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Standort" }), {
      target: { value: "Nord" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Alice Müller/ }));
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Teammitglieder durchsuchen" }),
      { target: { value: "Bob" } },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Bob Neu/ }));
    expect(
      screen.queryByRole("checkbox", { name: /Sam Pause/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Team speichern" }));
    await screen.findByText("Team mit Mitgliedern angelegt.");
    expect(mocks.rpc).toHaveBeenCalledWith("create_team", {
      p_name: "Frühdienst",
      p_location_name: "Nord",
      p_member_ids: ["alice", "bob"],
    });
  });

  it("adds and removes existing team members while preserving a suspended member", async () => {
    setup("/app/admin/teams");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Mitglieder verwalten" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Mitglieder verwalten" }),
    );
    expect(screen.getByRole("checkbox", { name: /Sam Pause/ })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /Alice Müller/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Bob Neu/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Mitglieder speichern" }),
    );
    await screen.findByText("Mitglieder von Pflege Nord gespeichert.");
    expect(mocks.rpc).toHaveBeenCalledWith("set_team_members", {
      p_team_id: "team-a",
      p_member_ids: ["suspended", "bob"],
    });
  });
});

describe("employee data correction", () => {
  it("keeps corrections and deletion exclusive to Super Admin while retaining invitation management", async () => {
    mocks.has.mockImplementation((permission) => permission !== "data.correct");
    const client = setup("/app/admin/users");
    await screen.findByRole("link", { name: "Bob Neu" });
    expect(
      screen.getByRole("button", {
        name: "Einladung an Bob Neu erneut senden",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Benutzer Bob Neu löschen" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Bob Neu" }));
    await screen.findByRole("heading", { name: "Bob Neu" });
    expect(
      screen.queryByRole("button", { name: "Mitarbeiterdaten speichern" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "E-Mail-Adresse ändern" }),
    ).not.toBeInTheDocument();
    client.clear();
  });
  it("saves personal and business fields without changing login credentials or sending an invitation", async () => {
    setup("/app/admin/users/bob");
    fireEvent.change(await screen.findByRole("textbox", { name: "Vorname" }), {
      target: { value: "Robert" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Anzeigename" }), {
      target: { value: "Robert Neu" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Mitarbeiternummer" }),
      { target: { value: "M-42" } },
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Telefon" }), {
      target: { value: "030 12345" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Funktion" }), {
      target: { value: "Pflegefachkraft" },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Beschäftigungsstatus" }),
      { target: { value: "leave" } },
    );
    fireEvent.change(screen.getByLabelText("Eintritt"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Austritt"), {
      target: { value: "2026-12-31" },
    });
    fireEvent.change(screen.getByLabelText("Geburtsdatum"), {
      target: { value: "1990-02-03" },
    });
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Wochenstunden" }),
      { target: { value: "32.5" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Mitarbeiterdaten speichern" }),
    );
    await screen.findByText("Mitarbeiterdaten gespeichert.");
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(
      "admin-update-employee",
      {
        body: {
          profileId: "bob",
          firstName: "Robert",
          lastName: "Neu",
          displayName: "Robert Neu",
          employeeNumber: "M-42",
          workPhone: "030 12345",
          jobTitle: "Pflegefachkraft",
          employmentStatus: "leave",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          birthDate: "1990-02-03",
          weeklyHours: 32.5,
        },
      },
    );
  });

  it("corrects the invited account's email through an explicit separate action without resending", async () => {
    setup("/app/admin/users/bob");
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Dienstliche E-Mail" }),
      { target: { value: "Corrected@Example.test" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "E-Mail-Adresse ändern" }),
    );
    await screen.findByText(
      "E-Mail-Adresse geändert. Es wurde keine Nachricht versendet.",
    );
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(
      "admin-update-employee-email",
      { body: { profileId: "bob", email: "corrected@example.test" } },
    );
  });

  it("preserves editable input and explains duplicate email failures", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        error: {
          message:
            "Diese E-Mail-Adresse wird bereits verwendet. Bitte prüfen Sie die Adresse.",
        },
      },
      error: null,
    });
    setup("/app/admin/users/bob");
    const input = await screen.findByRole("textbox", {
      name: "Dienstliche E-Mail",
    });
    fireEvent.change(input, { target: { value: "taken@example.test" } });
    fireEvent.click(
      screen.getByRole("button", { name: "E-Mail-Adresse ändern" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "bereits verwendet",
    );
    expect(input).toHaveValue("taken@example.test");
    expect(
      screen.getByRole("button", { name: "E-Mail-Adresse ändern" }),
    ).toBeEnabled();
  });

  it("does not expose personal or email editing to read-only users", async () => {
    mocks.has.mockImplementation((permission) => permission === "users.view");
    setup("/app/admin/users/bob");
    await screen.findByRole("heading", { name: "Bob Neu" });
    expect(
      screen.queryByRole("button", { name: "Mitarbeiterdaten speichern" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "E-Mail-Adresse ändern" }),
    ).not.toBeInTheDocument();
  });
});
