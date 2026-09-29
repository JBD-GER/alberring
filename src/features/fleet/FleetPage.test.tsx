// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FleetPage } from "./FleetPage";

type TestVehicle = {
  id: string;
  internal_name: string;
  license_plate: string;
  make: string | null;
  model: string | null;
  status: string;
  current_mileage: number;
  next_service_on: string | null;
  vehicle_assignments: Array<{
    id: string;
    profile_id: string;
    valid_from: string;
    valid_until: null;
    primary_assignment: boolean;
    profiles: { id: string; display_name: string };
  }>;
};

const state = vi.hoisted(() => ({
  vehicles: [] as TestVehicle[],
  maintenance: [] as Array<Record<string, unknown>>,
  damages: [] as Array<Record<string, unknown>>,
  mileage: [] as Array<Record<string, unknown>>,
  permissions: ["fleet.manage"],
  rpc: vi.fn(),
  employee: "22222222-2222-4222-8222-222222222222",
}));

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    appSession: { profile: { id: "admin", organization_id: "org" } },
    has: (permission: string) => state.permissions.includes(permission),
  }),
}));

vi.mock("../../lib/supabase", () => ({
  supabase: {
    rpc: state.rpc,
    from: (table: string) => {
      let columns = "";
      const query = {
        select: (value: string) => {
          columns = value;
          return query;
        },
        order: () => query,
        limit: () => query,
        then: (resolve: (value: unknown) => unknown) => {
          // Production has both a single-column and a tenant-bound FK here.
          // PostgREST rejects an embed that does not choose a relationship.
          const ambiguousRelationship =
            table === "vehicles" && columns.includes("vehicle_assignments(");
          return Promise.resolve({
            data: ambiguousRelationship
              ? null
              : table === "vehicles"
                ? [...state.vehicles]
                : table === "vehicle_maintenance_events"
                  ? [...state.maintenance]
                  : table === "vehicle_damage_reports"
                    ? [...state.damages]
                    : table === "mileage_submissions"
                      ? [...state.mileage]
                      : [],
            error: ambiguousRelationship
              ? { code: "PGRST201", message: "More than one relationship" }
              : null,
          }).then(resolve);
        },
      };
      return query;
    },
  },
}));

function vehicle(overrides: Partial<TestVehicle> = {}): TestVehicle {
  return {
    id: "vehicle-1",
    internal_name: "Tourenfahrzeug 12",
    license_plate: "AC-AB 123",
    make: "Volkswagen",
    model: "up!",
    status: "active",
    current_mileage: 12000,
    next_service_on: null,
    vehicle_assignments: [],
    ...overrides,
  };
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <FleetPage />
    </QueryClientProvider>,
  );
}

function change(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function editVehicle(name: string) {
  const card = screen.getByRole("heading", { name }).closest("article");
  if (!card) throw new Error("Fahrzeugkarte fehlt");
  fireEvent.click(within(card).getByRole("button", { name: "Bearbeiten" }));
}

beforeEach(() => {
  state.vehicles = [];
  state.maintenance = [];
  state.damages = [];
  state.mileage = [];
  state.permissions = ["fleet.manage"];
  state.rpc.mockReset().mockImplementation(async (name, params) => {
    if (name === "list_directory_entries") {
      return {
        data: [{ id: state.employee, display_name: "Erika Muster" }],
        error: null,
      };
    }
    if (name === "save_vehicle") {
      const saved = vehicle({
        id: params.p_vehicle_id ?? "created-vehicle",
        internal_name: params.p_internal_name,
        license_plate: params.p_license_plate,
        make: params.p_make,
        model: params.p_model,
        status: params.p_status,
        current_mileage: params.p_current_mileage,
        next_service_on: params.p_next_service_on,
        vehicle_assignments: params.p_assignee_id
          ? [
              {
                id: "assignment",
                profile_id: params.p_assignee_id,
                valid_from: "2000-01-01",
                valid_until: null,
                primary_assignment: true,
                profiles: {
                  id: params.p_assignee_id,
                  display_name: "Erika Muster",
                },
              },
            ]
          : [],
      });
      state.vehicles = [
        ...state.vehicles.filter((entry) => entry.id !== saved.id),
        saved,
      ];
      return { data: saved.id, error: null };
    }
    if (name === "save_vehicle_maintenance_event") {
      const old = state.maintenance.find(
        (item) => item.id === params.p_event_id,
      );
      const saved = maintenance({
        ...old,
        id: params.p_event_id ?? "new-maintenance",
        vehicle_id: params.p_vehicle_id,
        event_type: params.p_event_type,
        title: params.p_title,
        due_on: params.p_due_on,
        due_mileage: params.p_due_mileage,
        provider: params.p_provider,
        notes: params.p_notes,
        status: params.p_status,
        completed_on: params.p_completed_on,
        completed_mileage: params.p_completed_mileage,
      });
      state.maintenance = [
        ...state.maintenance.filter((item) => item.id !== saved.id),
        saved,
      ];
      return { data: saved.id, error: null };
    }
    if (name === "correct_vehicle_damage_report") {
      state.damages = state.damages.map((item) =>
        item.id === params.p_report_id
          ? {
              ...item,
              vehicle_id: params.p_vehicle_id,
              occurred_on: params.p_occurred_on,
              description: params.p_description,
              status: params.p_status,
            }
          : item,
      );
      return { data: null, error: null };
    }
    if (name === "correct_mileage_submission") {
      state.mileage = state.mileage.map((item) =>
        item.id === params.p_submission_id
          ? {
              ...item,
              mileage: params.p_mileage,
              read_on: params.p_read_on,
              status: params.p_status,
            }
          : item,
      );
      return { data: null, error: null };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  });
});
afterEach(cleanup);

describe("Fahrzeuge laden und speichern", () => {
  it("lädt Fahrzeuge trotz der beiden Fremdschlüssel für Zuweisungen", async () => {
    state.vehicles = [vehicle()];
    mount();
    await screen.findByRole("heading", { name: "Tourenfahrzeug 12" });
    expect(screen.getByText("AC-AB 123")).toBeTruthy();
  });

  it("legt ein Fahrzeug mit Zuweisung an und zeigt es nach dem Speichern", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Fahrzeug" }));
    await screen.findByRole("option", { name: "Erika Muster" });
    change("Interne Bezeichnung", "  Tourenfahrzeug 7  ");
    change("Amtliches Kennzeichen", " ac-ab 777 ");
    change("Aktueller Kilometerstand", "42000");
    change("Primär zugewiesen an", state.employee);
    fireEvent.click(screen.getByRole("button", { name: "Fahrzeug speichern" }));
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith("save_vehicle", {
        p_vehicle_id: null,
        p_internal_name: "Tourenfahrzeug 7",
        p_license_plate: "AC-AB 777",
        p_make: null,
        p_model: null,
        p_status: "active",
        p_current_mileage: 42000,
        p_next_service_on: null,
        p_assignee_id: state.employee,
      }),
    );
    await screen.findByRole("heading", { name: "Tourenfahrzeug 7" });
    expect(screen.getByText(/Erika Muster · Primärfahrzeug/)).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Fahrzeug speichern" }),
      ).toBeNull(),
    );
  });

  it("speichert Änderungen unter der bestehenden Fahrzeug-ID", async () => {
    state.vehicles = [vehicle()];
    mount();
    await screen.findByRole("heading", { name: "Tourenfahrzeug 12" });
    editVehicle("Tourenfahrzeug 12");
    change("Interne Bezeichnung", "Tourenfahrzeug 13");
    change("Aktueller Kilometerstand", "12500");
    change("Nächste Wartung", "2030-01-10");
    fireEvent.click(screen.getByRole("button", { name: "Fahrzeug speichern" }));
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith(
        "save_vehicle",
        expect.objectContaining({
          p_vehicle_id: "vehicle-1",
          p_internal_name: "Tourenfahrzeug 13",
          p_current_mileage: 12500,
          p_next_service_on: "2030-01-10",
        }),
      ),
    );
    await screen.findByRole("heading", { name: "Tourenfahrzeug 13" });
  });

  it("lädt beim Wechsel des bearbeiteten Fahrzeugs dessen eigene Stammdaten", async () => {
    state.vehicles = [
      vehicle(),
      vehicle({
        id: "vehicle-2",
        internal_name: "Poolfahrzeug",
        license_plate: "AC-AB 456",
        current_mileage: 8500,
      }),
    ];
    mount();
    await screen.findByRole("heading", { name: "Tourenfahrzeug 12" });
    editVehicle("Tourenfahrzeug 12");
    change("Interne Bezeichnung", "Ungespeicherte Änderung");
    editVehicle("Poolfahrzeug");
    expect(
      (screen.getByLabelText("Interne Bezeichnung") as HTMLInputElement).value,
    ).toBe("Poolfahrzeug");
    fireEvent.click(screen.getByRole("button", { name: "Fahrzeug speichern" }));
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith(
        "save_vehicle",
        expect.objectContaining({
          p_vehicle_id: "vehicle-2",
          p_internal_name: "Poolfahrzeug",
          p_license_plate: "AC-AB 456",
          p_current_mileage: 8500,
        }),
      ),
    );
  });

  it("zeigt Eingabefehler an, wenn sie das Speichern verhindern", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Fahrzeug" }));
    change("Interne Bezeichnung", "Poolfahrzeug");
    change("Amtliches Kennzeichen", "AC-AB 456");
    change("Hersteller", "x".repeat(81));
    change("Aktueller Kilometerstand", "");
    fireEvent.click(screen.getByRole("button", { name: "Fahrzeug speichern" }));
    await screen.findByText("Maximal 80 Zeichen.");
    await screen.findByText("Bitte einen Kilometerstand eingeben.");
    expect(state.rpc.mock.calls.some(([name]) => name === "save_vehicle")).toBe(
      false,
    );
  });
});

function maintenance(overrides: Record<string, unknown> = {}) {
  return {
    id: "maintenance-1",
    vehicle_id: "vehicle-1",
    event_type: "service",
    title: "Jahresinspektion",
    due_on: "2030-03-12",
    due_mileage: 16000,
    completed_on: null,
    completed_mileage: null,
    status: "planned",
    provider: "Werkstatt Alt",
    notes: "Ölwechsel",
    created_at: "2026-01-02T09:00:00Z",
    vehicles: {
      internal_name: "Tourenfahrzeug 12",
      license_plate: "AC-AB 123",
      current_mileage: 12000,
    },
    ...overrides,
  };
}
function editMaintenance(title: string) {
  const card = screen.getByRole("heading", { name: title }).closest("article");
  if (!card) throw new Error("Wartungskarte fehlt");
  fireEvent.click(
    within(card).getByRole("button", { name: "Wartung bearbeiten" }),
  );
}

describe("Bestehende Fuhrparkdaten korrigieren", () => {
  beforeEach(() => {
    state.permissions = ["fleet.manage", "mileage.manage", "data.correct"];
    state.vehicles = [vehicle()];
    state.maintenance = [maintenance()];
  });
  it("lädt eine geplante Wartung vollständig und speichert Termin und Werkstatt unter derselben ID", async () => {
    mount();
    await screen.findByRole("heading", { name: "Jahresinspektion" });
    editMaintenance("Jahresinspektion");
    expect((screen.getByLabelText("Fällig am") as HTMLInputElement).value).toBe(
      "2030-03-12",
    );
    expect(
      (screen.getByLabelText("Werkstatt / Dienstleister") as HTMLInputElement)
        .value,
    ).toBe("Werkstatt Alt");
    change("Bezeichnung", "Inspektion verschoben");
    change("Art", "inspection");
    change("Fällig am", "2030-04-20");
    change("Fällig bei Kilometerstand", "18000");
    change("Werkstatt / Dienstleister", "Werkstatt Neu");
    fireEvent.click(screen.getByRole("button", { name: "Wartung speichern" }));
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith("save_vehicle_maintenance_event", {
        p_event_id: "maintenance-1",
        p_vehicle_id: "vehicle-1",
        p_event_type: "inspection",
        p_title: "Inspektion verschoben",
        p_due_on: "2030-04-20",
        p_due_mileage: 18000,
        p_status: "planned",
        p_provider: "Werkstatt Neu",
        p_notes: "Ölwechsel",
        p_completed_on: null,
        p_completed_mileage: null,
      }),
    );
    await screen.findByRole("heading", { name: "Inspektion verschoben" });
    expect(screen.getByText("Werkstatt: Werkstatt Neu")).toBeTruthy();
    expect(state.maintenance).toHaveLength(1);
  });
  it("korrigiert bereits abgeschlossene Wartungen über Alle Termine", async () => {
    state.maintenance = [
      maintenance({
        status: "completed",
        completed_on: "2026-01-03",
        completed_mileage: 13000,
      }),
    ];
    mount();
    change("Wartungsstatus filtern", "all");
    await screen.findByRole("heading", { name: "Jahresinspektion" });
    editMaintenance("Jahresinspektion");
    expect(
      (screen.getByLabelText("Abgeschlossen am") as HTMLInputElement).value,
    ).toBe("2026-01-03");
    change("Abgeschlossen am", "2026-01-04");
    change("Abschluss-Kilometerstand", "13200");
    fireEvent.click(screen.getByRole("button", { name: "Wartung speichern" }));
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith(
        "save_vehicle_maintenance_event",
        expect.objectContaining({
          p_event_id: "maintenance-1",
          p_status: "completed",
          p_completed_on: "2026-01-04",
          p_completed_mileage: 13200,
        }),
      ),
    );
    await screen.findByText("Abgeschlossen bei 13.200 km");
  });
  it("storniert einen Termin ohne ihn aus der Historie zu löschen", async () => {
    mount();
    await screen.findByRole("heading", { name: "Jahresinspektion" });
    editMaintenance("Jahresinspektion");
    change("Wartungsstatus", "cancelled");
    fireEvent.click(screen.getByRole("button", { name: "Wartung speichern" }));
    await waitFor(() => expect(state.maintenance[0].status).toBe("cancelled"));
    change("Wartungsstatus filtern", "all");
    await screen.findByText("Storniert");
    expect(state.maintenance).toHaveLength(1);
  });
  it("verhindert einen Abschluss ohne gültiges Abschlussdatum", async () => {
    mount();
    await screen.findByRole("heading", { name: "Jahresinspektion" });
    editMaintenance("Jahresinspektion");
    change("Wartungsstatus", "completed");
    fireEvent.click(screen.getByRole("button", { name: "Wartung speichern" }));
    await screen.findByText(
      "Bitte ein Abschlussdatum bis einschließlich heute angeben.",
    );
    expect(
      state.rpc.mock.calls.some(
        ([name]) => name === "save_vehicle_maintenance_event",
      ),
    ).toBe(false);
  });
  it("setzt beim Wechsel der Wartung die Formularwerte neu", async () => {
    state.maintenance.push(
      maintenance({
        id: "maintenance-2",
        title: "Reifenwechsel",
        due_on: "2031-01-10",
      }),
    );
    mount();
    await screen.findByRole("heading", { name: "Jahresinspektion" });
    editMaintenance("Jahresinspektion");
    change("Bezeichnung", "Ungespeichert");
    editMaintenance("Reifenwechsel");
    expect(
      (screen.getByLabelText("Bezeichnung") as HTMLInputElement).value,
    ).toBe("Reifenwechsel");
    expect((screen.getByLabelText("Fällig am") as HTMLInputElement).value).toBe(
      "2031-01-10",
    );
  });
  it("bietet mit fleet.manage allein keine neuen Korrekturen an", async () => {
    state.permissions = ["fleet.manage"];
    mount();
    await screen.findByRole("heading", { name: "Jahresinspektion" });
    expect(
      screen.queryByRole("button", { name: "Wartung bearbeiten" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Wartung abschließen" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wartung planen" })).toBeTruthy();
  });
  it("korrigiert die Beschreibung und das Datum einer vorhandenen Schadensmeldung", async () => {
    state.damages = [
      {
        id: "damage-1",
        vehicle_id: "vehicle-1",
        reported_by: state.employee,
        occurred_on: "2026-01-04",
        description: "Kratzer an der Tür",
        status: "reported",
        resolved_by: null,
        resolved_at: null,
        created_at: "2026-01-05T09:00:00Z",
        vehicles: {
          internal_name: "Tourenfahrzeug 12",
          license_plate: "AC-AB 123",
        },
        profiles: { display_name: "Erika Muster" },
      },
    ];
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Meldung bearbeiten" }),
    );
    change("Schadensbeschreibung", "Kratzer an der rechten hinteren Tür");
    change("Schadensdatum", "2026-01-03");
    change("Bearbeitungsstatus", "repair_planned");
    fireEvent.click(
      screen.getByRole("button", { name: "Schadensmeldung speichern" }),
    );
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith("correct_vehicle_damage_report", {
        p_report_id: "damage-1",
        p_vehicle_id: "vehicle-1",
        p_occurred_on: "2026-01-03",
        p_description: "Kratzer an der rechten hinteren Tür",
        p_status: "repair_planned",
      }),
    );
    await screen.findByText("Kratzer an der rechten hinteren Tür");
    expect(state.damages[0].reported_by).toBe(state.employee);
  });
  it("fordert bei Kilometerkorrekturen eine Begründung und zeigt anschließend den gespeicherten Wert", async () => {
    state.mileage = [
      {
        id: "mileage-1",
        vehicle_id: "vehicle-1",
        profile_id: state.employee,
        mileage: 21000,
        read_on: "2026-01-04",
        reporting_month: "2026-01-01",
        status: "verified",
        photo_path: null,
        created_at: "2026-01-04T09:00:00Z",
        vehicles: {
          internal_name: "Tourenfahrzeug 12",
          license_plate: "AC-AB 123",
        },
        profiles: { display_name: "Erika Muster" },
      },
    ];
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Meldung korrigieren" }),
    );
    change("Korrigierter Kilometerstand", "12000");
    fireEvent.click(
      screen.getByRole("button", { name: "Korrektur speichern" }),
    );
    await screen.findByText(
      "Bitte die Korrektur kurz begründen (mindestens 6 Zeichen).",
    );
    expect(
      state.rpc.mock.calls.some(
        ([name]) => name === "correct_mileage_submission",
      ),
    ).toBe(false);
    change(/Korrekturgrund/, "Zahlendreher anhand Tachofoto berichtigt");
    fireEvent.click(
      screen.getByRole("button", { name: "Korrektur speichern" }),
    );
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith("correct_mileage_submission", {
        p_submission_id: "mileage-1",
        p_mileage: 12000,
        p_read_on: "2026-01-04",
        p_status: "verified",
        p_comment: "Zahlendreher anhand Tachofoto berichtigt",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Korrektur speichern" }),
      ).toBeNull(),
    );
    expect(state.mileage[0].mileage).toBe(12000);
  });
});
