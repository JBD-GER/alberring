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
import { LeavePage } from "./leave/LeavePage";
import { SickLeavePage } from "./sick-leave/SickLeavePage";

const state = vi.hoisted(() => ({
  permissions: [] as string[],
  rpc: vi.fn(),
  actor: "11111111-1111-4111-8111-111111111111",
  employee: "22222222-2222-4222-8222-222222222222",
}));

vi.mock("./auth/AuthProvider", () => ({
  useAuth: () => ({
    appSession: { profile: { id: state.actor, organization_id: "org" } },
    has: (permission: string) => state.permissions.includes(permission),
  }),
}));
vi.mock("../lib/supabase", () => ({
  supabase: {
    rpc: state.rpc,
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: async () => ({
          data:
            table === "profiles"
              ? [
                  {
                    id: state.employee,
                    display_name: "Erika Muster",
                    email: "erika@example.test",
                  },
                ]
              : [],
          error: null,
        }),
      };
      return query;
    },
  },
}));

function mount(page: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    ...render(page, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
    client,
  };
}

function leaveRequest(profileId = state.employee, status = "submitted") {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    profile_id: profileId,
    leave_type: "annual",
    starts_on: "2030-01-07",
    ends_on: "2030-01-08",
    day_fraction: 1,
    workdays: 2,
    note: null,
    status,
    decided_by: null,
    decided_at: null,
    decision_note: null,
    created_at: "2030-01-02T09:00:00Z",
    profiles: { id: profileId, display_name: "Erika Muster" },
  };
}

beforeEach(() => {
  state.permissions = [];
  state.rpc.mockReset().mockImplementation(async (name: string) => ({
    data: name.startsWith("list_")
      ? []
      : "33333333-3333-4333-8333-333333333333",
    error: null,
  }));
});
afterEach(cleanup);

describe("Urlaubsfreigaben", () => {
  it("bestätigt die erste Freigabe und erklärt die noch notwendige zweite Genehmigung", async () => {
    state.permissions = ["leave.manage"];
    const request = leaveRequest();
    state.rpc.mockImplementation(async (name: string) => {
      if (name === "decide_leave_request") request.status = "review";
      return {
        data: name === "list_leave_requests" ? [{ ...request }] : null,
        error: null,
      };
    });
    mount(<LeavePage />);
    fireEvent.click(
      await screen.findByRole("tab", { name: /Team & Freigabe/ }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Antrag bearbeiten" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Genehmigen" }));
    await screen.findByText(/Ihre Freigabe wurde gespeichert/);
    expect(
      screen.getByText(
        /Genehmigung einer weiteren berechtigten Person erforderlich/,
      ),
    ).toBeTruthy();
    expect(screen.getAllByText("In Prüfung").length).toBeGreaterThan(0);
  });

  it.each(["leave.approve", "leave.manage"])(
    "zeigt und speichert fremde Freigaben mit %s ohne zusätzliches Ansichtsrecht",
    async (permission) => {
      state.permissions = [permission];
      const request = leaveRequest();
      state.rpc.mockImplementation(async (name: string) => {
        if (name === "decide_leave_request") request.status = "approved";
        return {
          data: name === "list_leave_requests" ? [{ ...request }] : null,
          error: null,
        };
      });
      mount(<LeavePage />);
      fireEvent.click(
        await screen.findByRole("tab", { name: /Team & Freigabe/ }),
      );
      fireEvent.click(
        await screen.findByRole("button", { name: "Antrag bearbeiten" }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Genehmigen" }));
      await waitFor(() =>
        expect(state.rpc).toHaveBeenCalledWith("decide_leave_request", {
          p_request_id: request.id,
          p_status: "approved",
          p_note: null,
        }),
      );
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Genehmigen" })).toBeNull(),
      );
      expect(
        screen.queryByRole("button", { name: "Antrag bearbeiten" }),
      ).toBeNull();
      expect(screen.getAllByText("Genehmigt").length).toBeGreaterThan(0);
      expect(
        screen.getByText(/Eine weitere Freigabe ist nicht erforderlich/),
      ).toBeTruthy();
    },
  );

  it("erklärt die erforderliche fremde Freigabe für eigene offene Anträge", async () => {
    state.permissions = ["leave.manage"];
    state.rpc.mockResolvedValue({
      data: [leaveRequest(state.actor)],
      error: null,
    });
    mount(<LeavePage />);
    await screen.findByText(
      /Eigene Anträge müssen von einer anderen berechtigten Person/,
    );
    expect(
      screen.queryByRole("button", { name: "Antrag bearbeiten" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Antrag zurückziehen" }),
    ).toBeTruthy();
  });

  it("lässt Admins den eigenen Antrag ohne weitere Person genehmigen", async () => {
    state.permissions = ["leave.create", "leave.manage"];
    const request = leaveRequest(state.actor);
    state.rpc.mockImplementation(async (name: string) => {
      if (name === "decide_leave_request") request.status = "approved";
      return {
        data: name === "list_leave_requests" ? [{ ...request }] : null,
        error: null,
      };
    });
    mount(<LeavePage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Antrag bearbeiten" }),
    );
    expect(
      screen.queryByText(/Eigene Anträge müssen von einer anderen/),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Genehmigen" }));
    await screen.findByText(/Eine weitere Freigabe ist nicht erforderlich/);
    expect(state.rpc).toHaveBeenCalledWith("decide_leave_request", {
      p_request_id: request.id,
      p_status: "approved",
      p_note: null,
    });
    expect(
      screen.queryByRole("button", { name: "Antrag bearbeiten" }),
    ).toBeNull();
  });

  it("erlaubt mit reinem Erfassungsrecht keine eigene Freigabe", async () => {
    state.permissions = ["leave.create", "leave.approve"];
    state.rpc.mockResolvedValue({
      data: [leaveRequest(state.actor)],
      error: null,
    });
    mount(<LeavePage />);
    await screen.findByText(
      /Eigene Anträge müssen von einer anderen berechtigten Person/,
    );
    expect(
      screen.queryByRole("button", { name: "Antrag bearbeiten" }),
    ).toBeNull();
  });

  it("bietet mit reinem Ansichtsrecht keine Freigabe an", async () => {
    state.permissions = ["leave.view_team"];
    state.rpc.mockResolvedValue({ data: [leaveRequest()], error: null });
    mount(<LeavePage />);
    fireEvent.click(
      await screen.findByRole("tab", { name: /Team & Freigabe/ }),
    );
    await screen.findByRole("heading", { name: "Erika Muster" });
    expect(
      screen.queryByRole("button", { name: "Antrag bearbeiten" }),
    ).toBeNull();
  });

  it("verbirgt Teamdaten und offene Freigabeformulare nach Entzug der Rolle", async () => {
    state.permissions = ["leave.manage"];
    state.rpc.mockResolvedValue({ data: [leaveRequest()], error: null });
    const view = mount(<LeavePage />);
    fireEvent.click(
      await screen.findByRole("tab", { name: /Team & Freigabe/ }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Antrag bearbeiten" }),
    );
    expect(screen.getByRole("button", { name: "Genehmigen" })).toBeTruthy();
    state.permissions = ["leave.view_own"];
    view.rerender(<LeavePage />);
    expect(screen.queryByRole("button", { name: "Genehmigen" })).toBeNull();
    expect(screen.queryByText("Erika Muster")).toBeNull();
    expect(screen.getByText("Noch kein Urlaubsantrag")).toBeTruthy();
  });
});

describe("Abwesenheiten durch die Administration erfassen", () => {
  it("zeigt Mitarbeitenden den Urlaubsstatus ohne Erfassungsaktion", async () => {
    state.permissions = ["leave.view_own"];
    mount(<LeavePage />);
    await screen.findByText("Noch kein Urlaubsantrag");
    expect(
      screen.queryByRole("button", { name: /erfassen|stellen|beantragen/i }),
    ).toBeNull();
    expect(
      screen.getByText(/Neue Anträge erfasst Ihre Administration/),
    ).toBeTruthy();
  });

  it("zeigt Mitarbeitenden Krankmeldungen ohne Erfassungsaktion", async () => {
    state.permissions = ["sick_leave.view_own"];
    mount(<SickLeavePage />);
    await screen.findByText("Keine Krankmeldung vorhanden");
    expect(
      screen.queryByRole("button", { name: /erfassen|melden/i }),
    ).toBeNull();
    expect(
      screen.getByText(/Neue Meldungen erfasst Ihre Administration/),
    ).toBeTruthy();
  });

  it("speichert Urlaub für die ausgewählte Person und wechselt zur Teamansicht", async () => {
    state.permissions = ["leave.create", "leave.view_own", "leave.view_team"];
    mount(<LeavePage />);
    fireEvent.click(
      screen.getByRole("button", { name: "Urlaubsantrag erfassen" }),
    );
    await screen.findByRole("option", { name: /Erika Muster/ });
    fireEvent.change(screen.getByLabelText("Mitarbeiter/in"), {
      target: { value: state.employee },
    });
    fireEvent.change(screen.getByLabelText("Von"), {
      target: { value: "2030-01-07" },
    });
    fireEvent.change(screen.getByLabelText("Bis"), {
      target: { value: "2030-01-08" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Antrag speichern" }));
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith("create_leave_request_for_user", {
        p_profile_id: state.employee,
        p_leave_type: "annual",
        p_starts_on: "2030-01-07",
        p_ends_on: "2030-01-08",
        p_day_fraction: 1,
        p_note: null,
      }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("tab", { name: /Team & Freigabe/ })
          .getAttribute("aria-selected"),
      ).toBe("true"),
    );
  });

  it("verhindert Urlaub ohne ausgewählte Person", async () => {
    state.permissions = ["leave.create"];
    mount(<LeavePage />);
    fireEvent.click(
      screen.getByRole("button", { name: "Urlaubsantrag erfassen" }),
    );
    await screen.findByRole("option", { name: /Erika Muster/ });
    fireEvent.change(screen.getByLabelText("Von"), {
      target: { value: "2030-01-07" },
    });
    fireEvent.change(screen.getByLabelText("Bis"), {
      target: { value: "2030-01-08" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Antrag speichern" }));
    await screen.findByText("Bitte eine Person auswählen.");
    expect(
      state.rpc.mock.calls.some(
        ([name]) => name === "create_leave_request_for_user",
      ),
    ).toBe(false);
  });

  it("erfasst eine Krankmeldung für Mitarbeitende ohne fremden Attestzugriff", async () => {
    state.permissions = [
      "sick_leave.create",
      "sick_leave.view_status",
      "sick_leave.manage",
    ];
    mount(<SickLeavePage />);
    fireEvent.click(
      screen.getByRole("button", { name: "Krankmeldung erfassen" }),
    );
    await screen.findByRole("option", { name: /Erika Muster/ });
    fireEvent.change(screen.getByLabelText("Mitarbeiter/in"), {
      target: { value: state.employee },
    });
    fireEvent.change(screen.getByLabelText("Beginn"), {
      target: { value: "2030-01-07" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Das Enddatum ist noch nicht bekannt.",
      }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Ich bestätige/ }));
    expect(screen.queryByText("Attest direkt hochladen (optional)")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Krankmeldung speichern" }),
    );
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith("report_sick_leave_for_user", {
        p_profile_id: state.employee,
        p_starts_on: "2030-01-07",
        p_expected_end_on: null,
        p_end_unknown: true,
        p_certificate_status: "not_required",
      }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("tab", { name: /Abwesenheitsstatus/ })
          .getAttribute("aria-selected"),
      ).toBe("true"),
    );
  });
  it("lässt berechtigte Admins Atteste zur gespeicherten Mitarbeitermeldung nachreichen", async () => {
    state.permissions = ["sick_leave.manage", "sick_leave.view_certificates"];
    state.rpc.mockResolvedValue({
      data: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          profile_id: state.employee,
          starts_on: "2030-01-07",
          expected_end_on: null,
          end_unknown: true,
          certificate_status: "pending",
          status: "reported",
          created_at: "2030-01-07T09:00:00Z",
          profiles: { id: state.employee, display_name: "Erika Muster" },
        },
      ],
      error: null,
    });
    mount(<SickLeavePage />);
    fireEvent.click(await screen.findByRole("tab", { name: /HR-Ansicht/ }));
    await screen.findByRole("heading", { name: "Erika Muster" });
    expect(screen.getByLabelText("Folgeattest auswählen")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Attest hochladen" }),
    ).toBeTruthy();
  });
});
