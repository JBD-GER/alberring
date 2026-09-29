// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeavePage } from "./leave/LeavePage";
import { SickLeavePage } from "./sick-leave/SickLeavePage";
import { MaterialRequestsPage } from "./materials/MaterialRequestsPage";
import { DocumentDetail, Documents } from "./documents/Documents";
const state = vi.hoisted(() => ({
  permissions: [] as string[],
  rpc: vi.fn(),
  tables: {} as Record<string, unknown>,
  leave: [] as unknown[],
  sick: [] as unknown[],
}));
const actor = "11111111-1111-4111-8111-111111111111",
  employee = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333";
vi.mock("./auth/AuthProvider", () => ({
  useAuth: () => ({
    appSession: { profile: { id: actor, organization_id: "org" } },
    has: (p: string) => state.permissions.includes(p),
  }),
}));
vi.mock("../lib/supabase", () => ({
  supabase: {
    rpc: state.rpc,
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        in: () => query,
        order: () => query,
        single: async () => ({
          data: state.tables[table] ?? null,
          error: null,
        }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({
            data: state.tables[table] ?? [],
            error: null,
          }).then(resolve),
      };
      return query;
    },
  },
}));
function mount(node: React.ReactNode, path = "/") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  state.permissions = [
    "data.correct",
    "leave.manage",
    "leave.create",
    "sick_leave.manage",
    "sick_leave.view_certificates",
    "materials.manage",
    "documents.manage",
  ];
  state.tables = {};
  state.leave = [
    {
      id,
      profile_id: employee,
      leave_type: "annual",
      starts_on: "2020-01-06",
      ends_on: "2020-01-07",
      day_fraction: 1,
      workdays: 2,
      note: null,
      status: "approved",
      decided_by: actor,
      decided_at: "2020-01-01",
      created_at: "2020-01-01",
      profiles: { id: employee, display_name: "Erika Muster" },
    },
  ];
  state.sick = [
    {
      id,
      profile_id: employee,
      starts_on: "2020-03-02",
      expected_end_on: "2020-03-03",
      end_unknown: false,
      certificate_status: "pending",
      status: "closed",
      created_at: "2020-03-01",
      profiles: { id: employee, display_name: "Erika Muster" },
    },
  ];
  state.rpc.mockReset().mockImplementation(async (name: string) => ({
    data:
      name === "list_leave_requests"
        ? state.leave
        : name === "list_sick_leave_records"
          ? state.sick
          : id,
    error: null,
  }));
});
afterEach(cleanup);
describe("Nachträgliche Super-Admin-Korrekturen", () => {
  it("benennt einen bestehenden Ordner mit Begründung ohne Freigabeänderung um", async () => {
    state.tables.document_folders = [
      {
        id,
        name: "Richtlinien",
        scope: "organization",
        owner_profile_id: null,
      },
    ];
    mount(<Documents />);
    fireEvent.click(await screen.findByRole("button", { name: /Richtlinien/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ordner umbenennen" }));
    expect(
      (screen.getByLabelText("Ordnername") as HTMLInputElement).value,
    ).toBe("Richtlinien");
    fireEvent.change(screen.getByLabelText("Ordnername"), {
      target: { value: "Dienstanweisungen" },
    });
    fireEvent.change(screen.getByLabelText("Korrekturgrund"), {
      target: { value: "Bezeichnung präzisiert" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Ordnername speichern" }),
    );
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith("rename_document_folder", {
        p_folder_id: id,
        p_name: "Dienstanweisungen",
        p_correction_reason: "Bezeichnung präzisiert",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Ordner umbenennen" }),
      ).toBeNull(),
    );
  });

  it("bietet fremde persönliche Ordner nicht zur Korrektur an", async () => {
    state.tables.document_folders = [
      {
        id,
        name: "Persönliche Unterlagen",
        scope: "personal",
        owner_profile_id: employee,
      },
    ];
    mount(<Documents />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Persönliche Unterlagen/ }),
    );
    expect(
      screen.queryByRole("button", { name: "Ordner umbenennen" }),
    ).toBeNull();
  });

  it("korrigiert historischen genehmigten Urlaub über separaten RPC mit Begründung", async () => {
    mount(<LeavePage />);
    fireEvent.click(
      await screen.findByRole("tab", { name: /Team & Freigabe/ }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Daten korrigieren" }),
    );
    const date = screen.getByLabelText("Von");
    expect(date.getAttribute("min")).toBeNull();
    fireEvent.change(screen.getByLabelText("Bis"), {
      target: { value: "2020-01-08" },
    });
    fireEvent.change(screen.getByLabelText("Korrekturgrund"), {
      target: { value: "Datum korrigiert" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Korrektur speichern" }),
    );
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith(
        "correct_leave_request",
        expect.objectContaining({
          p_request_id: id,
          p_starts_on: "2020-01-06",
          p_ends_on: "2020-01-08",
          p_correction_reason: "Datum korrigiert",
        }),
      ),
    );
    expect(
      state.rpc.mock.calls.some(
        ([name]) =>
          name === "create_leave_request_for_user" ||
          name === "decide_leave_request",
      ),
    ).toBe(false);
  });
  it("zeigt keine Datenkorrektur für gewöhnliche Urlaubsverwaltung", async () => {
    state.permissions = ["leave.manage"];
    mount(<LeavePage />);
    fireEvent.click(
      await screen.findByRole("tab", { name: /Team & Freigabe/ }),
    );
    await screen.findByText("Erholungsurlaub");
    expect(
      screen.queryByRole("button", { name: "Daten korrigieren" }),
    ).toBeNull();
  });
  it("korrigiert beendete Krankmeldung ohne Datei- oder Personenwechsel", async () => {
    mount(<SickLeavePage />);
    fireEvent.click(await screen.findByRole("tab", { name: /HR-Ansicht/ }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Daten von Erika Muster korrigieren/,
      }),
    );
    fireEvent.change(screen.getByLabelText("Voraussichtliches Ende"), {
      target: { value: "2020-03-04" },
    });
    fireEvent.change(screen.getByLabelText("Korrekturgrund (ohne Diagnose)"), {
      target: { value: "Datum berichtigt" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Korrektur speichern" }),
    );
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith("correct_sick_leave_record", {
        p_record_id: id,
        p_starts_on: "2020-03-02",
        p_expected_end_on: "2020-03-04",
        p_end_unknown: false,
        p_certificate_status: "pending",
        p_correction_reason: "Datum berichtigt",
      }),
    );
  });
  it("korrigiert eine fremde bestellte Materialanforderung ohne erneutes Einreichen", async () => {
    state.tables.material_requests = [
      {
        id,
        requester_id: employee,
        category: "care_supplies",
        item: "Handschuhe",
        quantity: 2,
        unit: "Packung",
        priority: "normal",
        needed_on: null,
        reason: null,
        status: "ordered",
        created_at: "2026-01-01",
        profiles: { id: employee, display_name: "Erika Muster" },
        material_request_status_history: [],
      },
    ];
    mount(<MaterialRequestsPage />);
    fireEvent.click(await screen.findByRole("tab", { name: /Bearbeitung/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Daten korrigieren" }),
    );
    fireEvent.change(screen.getByLabelText("Korrekturgrund"), {
      target: { value: "Menge korrigiert" },
    });
    fireEvent.change(screen.getByLabelText("Menge"), {
      target: { value: "3" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Korrektur speichern" }),
    );
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith(
        "correct_material_request",
        expect.objectContaining({
          p_request_id: id,
          p_quantity: 3,
          p_correction_reason: "Menge korrigiert",
        }),
      ),
    );
    expect(
      state.rpc.mock.calls.some(([name]) => name === "save_material_request"),
    ).toBe(false);
  });
  it("korrigiert Dokumenttitel ohne Änderung von Freigaben oder Versionen", async () => {
    state.tables.documents = {
      id,
      title: "Anweisung alt",
      visibility: "organization",
      created_at: "2026-01-01",
      owner_profile_id: null,
      acknowledgement_required: false,
      valid_from: null,
      valid_until: null,
      document_folders: null,
      document_versions: [],
      document_acknowledgements: [],
    };
    mount(
      <Routes>
        <Route path="/documents/:id" element={<DocumentDetail />} />
      </Routes>,
      "/documents/" + id,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Dokumentdaten korrigieren" }),
    );
    fireEvent.change(screen.getByLabelText("Titel"), {
      target: { value: "Anweisung neu" },
    });
    fireEvent.change(screen.getByLabelText("Korrekturgrund"), {
      target: { value: "Titel korrigiert" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Korrektur speichern" }),
    );
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith("correct_document_metadata", {
        p_document_id: id,
        p_title: "Anweisung neu",
        p_acknowledgement_required: false,
        p_valid_from: null,
        p_valid_until: null,
        p_correction_reason: "Titel korrigiert",
      }),
    );
  });
});
