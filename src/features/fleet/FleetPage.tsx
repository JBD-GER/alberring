import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  Car,
  Check,
  ClipboardCheck,
  Gauge,
  MapPin,
  Pencil,
  Plus,
  Save,
  UserRound,
  Wrench,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  EmptyState,
  ErrorState,
  FieldError,
  humanizeError,
  LoadingState,
  MutationNotice,
  StatusPill,
  todayInputValue,
  WorkflowHeader,
  WorkflowPanel,
  type StatusTone,
} from "../../components/form/WorkflowUI";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import "./fleet.css";

type VehicleStatus = "active" | "workshop" | "out_of_service" | "sold";
type VehicleAssignment = {
  id: string;
  profile_id: string;
  valid_from: string;
  valid_until: string | null;
  primary_assignment: boolean;
  profiles: { id: string; display_name: string } | null;
};
type Vehicle = {
  id: string;
  internal_name: string;
  license_plate: string;
  make: string | null;
  model: string | null;
  status: VehicleStatus;
  current_mileage: number;
  next_service_on: string | null;
  vehicle_assignments: VehicleAssignment[];
};
type MileageSubmission = {
  id: string;
  vehicle_id: string;
  profile_id: string;
  mileage: number;
  read_on: string;
  reporting_month: string;
  status: string;
  photo_path: string | null;
  created_at: string;
  vehicles: { internal_name: string; license_plate: string } | null;
  profiles: { display_name: string } | null;
};
type Person = { id: string; display_name: string };

type DamageStatus =
  "reported" | "reviewing" | "repair_planned" | "resolved" | "rejected";
type DamageReport = {
  id: string;
  vehicle_id: string;
  reported_by: string;
  occurred_on: string | null;
  description: string;
  status: DamageStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  vehicles: { internal_name: string; license_plate: string } | null;
  profiles: { display_name: string } | null;
};

type MaintenanceStatus = "planned" | "due" | "completed" | "cancelled";
type MaintenanceEventType =
  "service" | "inspection" | "repair" | "tyres" | "other";
type MaintenanceEvent = {
  id: string;
  vehicle_id: string;
  event_type: MaintenanceEventType;
  title: string;
  due_on: string | null;
  due_mileage: number | null;
  completed_on: string | null;
  completed_mileage: number | null;
  status: MaintenanceStatus;
  notes: string | null;
  created_at: string;
  vehicles: {
    internal_name: string;
    license_plate: string;
    current_mileage: number;
  } | null;
};

const vehicleStatusMeta: Record<
  VehicleStatus,
  { label: string; tone: StatusTone }
> = {
  active: { label: "Aktiv", tone: "success" },
  workshop: { label: "Werkstatt", tone: "warning" },
  out_of_service: { label: "Außer Betrieb", tone: "danger" },
  sold: { label: "Verkauft", tone: "neutral" },
};
const mileageStatusMeta: Record<string, { label: string; tone: StatusTone }> = {
  submitted: { label: "Eingereicht", tone: "info" },
  verified: { label: "Geprüft", tone: "success" },
  rejected: { label: "Abgelehnt", tone: "danger" },
  flagged: { label: "Prüfung nötig", tone: "warning" },
};
const damageStatusMeta: Record<
  DamageStatus,
  { label: string; tone: StatusTone }
> = {
  reported: { label: "Gemeldet", tone: "info" },
  reviewing: { label: "In Prüfung", tone: "warning" },
  repair_planned: { label: "Reparatur geplant", tone: "warning" },
  resolved: { label: "Erledigt", tone: "success" },
  rejected: { label: "Zurückgewiesen", tone: "neutral" },
};
const maintenanceStatusMeta: Record<
  MaintenanceStatus,
  { label: string; tone: StatusTone }
> = {
  planned: { label: "Geplant", tone: "info" },
  due: { label: "Fällig", tone: "warning" },
  completed: { label: "Abgeschlossen", tone: "success" },
  cancelled: { label: "Storniert", tone: "neutral" },
};
const maintenanceTypeLabels: Record<MaintenanceEventType, string> = {
  service: "Inspektion / Service",
  inspection: "TÜV / Prüfung",
  repair: "Reparatur",
  tyres: "Reifen",
  other: "Sonstiges",
};

const mileageSchema = z.object({
  vehicleId: z.string().min(1, "Bitte ein Fahrzeug auswählen."),
  mileage: z
    .number()
    .int("Nur ganze Kilometer eingeben.")
    .min(0, "Der Kilometerstand darf nicht negativ sein.")
    .max(9_999_999, "Bitte den Kilometerstand prüfen."),
  readOn: z.string().min(1, "Ablesedatum fehlt."),
});
type MileageFormValues = z.infer<typeof mileageSchema>;

const vehicleSchema = z.object({
  internalName: z.string().trim().min(2, "Interne Bezeichnung fehlt.").max(100),
  licensePlate: z.string().trim().min(2, "Kennzeichen fehlt.").max(20),
  make: z.string().trim().max(80),
  model: z.string().trim().max(80),
  status: z.enum(["active", "workshop", "out_of_service", "sold"]),
  currentMileage: z.number().int().min(0).max(9_999_999),
  nextServiceOn: z.string(),
  assigneeId: z.string(),
});
type VehicleFormValues = z.infer<typeof vehicleSchema>;

const damageSchema = z.object({
  vehicleId: z.string().min(1, "Bitte ein Fahrzeug auswählen."),
  occurredOn: z
    .string()
    .min(1, "Bitte das Schadensdatum angeben.")
    .refine(
      (value) => value <= todayInputValue(),
      "Das Schadensdatum darf nicht in der Zukunft liegen.",
    ),
  description: z
    .string()
    .trim()
    .min(10, "Bitte den Schaden in mindestens 10 Zeichen beschreiben.")
    .max(4000, "Maximal 4.000 Zeichen."),
});
type DamageFormValues = z.infer<typeof damageSchema>;

const maintenanceSchema = z
  .object({
    vehicleId: z.string().min(1, "Bitte ein Fahrzeug auswählen."),
    eventType: z.enum(["service", "inspection", "repair", "tyres", "other"]),
    title: z
      .string()
      .trim()
      .min(2, "Bitte einen aussagekräftigen Titel eingeben.")
      .max(160, "Maximal 160 Zeichen."),
    dueOn: z.string(),
    dueMileage: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || /^\d+$/.test(value),
        "Bitte ganze Kilometer eingeben.",
      )
      .refine(
        (value) => value === "" || Number(value) <= 9_999_999,
        "Bitte den Kilometerstand prüfen.",
      ),
    notes: z.string().trim().max(2000, "Maximal 2.000 Zeichen."),
  })
  .refine((values) => Boolean(values.dueOn || values.dueMileage), {
    message: "Bitte ein Fälligkeitsdatum oder einen Kilometerstand angeben.",
    path: ["dueOn"],
  });
type MaintenanceFormValues = z.infer<typeof maintenanceSchema>;

const maintenanceCompleteSchema = z.object({
  completedOn: z
    .string()
    .min(1, "Bitte das Abschlussdatum angeben.")
    .refine(
      (value) => value <= todayInputValue(),
      "Das Abschlussdatum darf nicht in der Zukunft liegen.",
    ),
  completedMileage: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d+$/.test(value),
      "Bitte ganze Kilometer eingeben.",
    )
    .refine(
      (value) => value === "" || Number(value) <= 9_999_999,
      "Bitte den Kilometerstand prüfen.",
    ),
});
type MaintenanceCompleteFormValues = z.infer<typeof maintenanceCompleteSchema>;

const allowedPhotoTypes = ["image/jpeg", "image/png"];
const maxPhotoSize = 10 * 1024 * 1024;

function validatePhoto(file: File) {
  if (!allowedPhotoTypes.includes(file.type))
    throw new Error("Bitte ein JPG- oder PNG-Bild auswählen.");
  if (file.size > maxPhotoSize)
    throw new Error("Das Foto darf höchstens 10 MB groß sein.");
}

function isMaintenanceDue(event: MaintenanceEvent) {
  if (event.status === "due") return true;
  if (event.status !== "planned") return false;
  return Boolean(
    (event.due_on && event.due_on <= todayInputValue()) ||
    (event.due_mileage !== null &&
      event.vehicles &&
      event.due_mileage <= event.vehicles.current_mileage),
  );
}

export function FleetPage() {
  const { appSession, has } = useAuth();
  const [mileageVehicle, setMileageVehicle] = useState<Vehicle | null>(null);
  const [damageVehicle, setDamageVehicle] = useState<Vehicle | null>(null);
  const [damageReviewTarget, setDamageReviewTarget] =
    useState<DamageReport | null>(null);
  const [maintenanceEditorOpen, setMaintenanceEditorOpen] = useState(false);
  const [maintenanceCompleteTarget, setMaintenanceCompleteTarget] =
    useState<MaintenanceEvent | null>(null);
  const [maintenanceFilter, setMaintenanceFilter] = useState<"open" | "all">(
    "open",
  );
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | "new" | null>(
    null,
  );
  const [reviewTarget, setReviewTarget] = useState<MileageSubmission | null>(
    null,
  );
  const canManage = has("fleet.manage");
  const canViewAll = has("fleet.view_all") || canManage;
  const canSubmitMileage = has("mileage.submit_own");
  const canManageMileage = has("mileage.manage");

  const vehiclesQuery = useQuery({
    queryKey: ["fleet-vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select(
          "id,internal_name,license_plate,make,model,status,current_mileage,next_service_on,vehicle_assignments(id,profile_id,valid_from,valid_until,primary_assignment,profiles!vehicle_assignments_profile_id_fkey(id,display_name))",
        )
        .order("internal_name");
      if (error) throw error;
      return data as unknown as Vehicle[];
    },
  });

  const mileageQuery = useQuery({
    queryKey: ["mileage-submissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mileage_submissions")
        .select(
          "id,vehicle_id,profile_id,mileage,read_on,reporting_month,status,photo_path,created_at,vehicles(internal_name,license_plate),profiles!mileage_submissions_profile_id_fkey(display_name)",
        )
        .order("read_on", { ascending: false })
        .limit(canManageMileage ? 250 : 36);
      if (error) throw error;
      return data as unknown as MileageSubmission[];
    },
  });

  const damageQuery = useQuery({
    queryKey: ["vehicle-damage-reports", canManage],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_damage_reports")
        .select(
          "id,vehicle_id,reported_by,occurred_on,description,status,resolved_by,resolved_at,created_at,vehicles(internal_name,license_plate),profiles!vehicle_damage_reports_reported_by_fkey(display_name)",
        )
        .order("created_at", { ascending: false })
        .limit(canManage ? 250 : 100);
      if (error) throw error;
      return data as unknown as DamageReport[];
    },
  });

  const maintenanceQuery = useQuery({
    queryKey: ["vehicle-maintenance-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_maintenance_events")
        .select(
          "id,vehicle_id,event_type,title,due_on,due_mileage,completed_on,completed_mileage,status,notes,created_at,vehicles(internal_name,license_plate,current_mileage)",
        )
        .order("due_on", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw error;
      return data as unknown as MaintenanceEvent[];
    },
    enabled: canManage,
  });

  const peopleQuery = useQuery({
    queryKey: ["fleet-people"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_directory_entries", {
        p_search: null,
      });
      if (error) throw error;
      return (data as Array<{ id: string; display_name: string }>).map(
        ({ id, display_name }) => ({ id, display_name }),
      );
    },
    enabled: canManage,
  });

  const vehicles = vehiclesQuery.data ?? [];
  const ownVehicles = vehicles.filter((vehicle) =>
    vehicle.vehicle_assignments.some(
      (assignment) =>
        assignment.profile_id === appSession?.profile.id &&
        assignment.valid_from <= todayInputValue() &&
        (!assignment.valid_until ||
          assignment.valid_until >= todayInputValue()),
    ),
  );
  const displayedVehicles = canViewAll ? vehicles : ownVehicles;
  const reportableVehicles = canManage ? vehicles : ownVehicles;
  const submissions = mileageQuery.data ?? [];
  const ownSubmissions = submissions.filter(
    (submission) => submission.profile_id === appSession?.profile.id,
  );
  const currentMonth = todayInputValue().slice(0, 7);
  const reportedThisMonth = ownSubmissions.some(
    (submission) =>
      submission.reporting_month.startsWith(currentMonth) &&
      submission.status !== "rejected",
  );
  const damageReports = damageQuery.data ?? [];
  const openDamageReports = damageReports.filter(
    (report) => report.status !== "resolved" && report.status !== "rejected",
  );
  const maintenanceEvents = maintenanceQuery.data ?? [];
  const visibleMaintenanceEvents = maintenanceEvents.filter(
    (event) =>
      maintenanceFilter === "all" ||
      (event.status !== "completed" && event.status !== "cancelled"),
  );
  const dueMaintenanceCount = maintenanceEvents.filter(
    (event) =>
      event.status === "due" ||
      (event.status === "planned" &&
        ((event.due_on !== null && event.due_on <= todayInputValue()) ||
          (event.due_mileage !== null &&
            event.vehicles !== null &&
            event.due_mileage <= event.vehicles.current_mileage))),
  ).length;

  return (
    <div className="wf-page fleet-page">
      <WorkflowHeader
        eyebrow="Fuhrpark"
        title="Fahrzeuge & Kilometerstände"
        description={
          canViewAll
            ? "Fahrzeugstatus, Zuweisungen, Wartungen und monatliche Meldungen im Überblick."
            : "Ihr zugewiesenes Fahrzeug und Ihre monatlichen Kilometerstandsmeldungen."
        }
        action={
          <div className="fleet-header-actions">
            {canManage ? (
              <button
                type="button"
                className="wf-secondary"
                onClick={() => setEditingVehicle("new")}
              >
                <Plus size={19} /> Fahrzeug
              </button>
            ) : null}
            {reportableVehicles.length ? (
              <button
                type="button"
                className="wf-secondary"
                onClick={() => setDamageVehicle(reportableVehicles[0])}
              >
                <AlertTriangle size={19} /> Schaden melden
              </button>
            ) : null}
            {canSubmitMileage && ownVehicles.length ? (
              <button
                type="button"
                className="wf-primary"
                onClick={() => setMileageVehicle(ownVehicles[0])}
              >
                <Gauge size={19} /> Kilometerstand melden
              </button>
            ) : null}
          </div>
        }
      />

      {mileageVehicle && appSession ? (
        <MileageForm
          vehicle={mileageVehicle}
          vehicles={ownVehicles}
          organizationId={appSession.profile.organization_id}
          onClose={() => setMileageVehicle(null)}
        />
      ) : null}
      {damageVehicle && appSession ? (
        <DamageReportForm
          vehicle={damageVehicle}
          vehicles={reportableVehicles}
          organizationId={appSession.profile.organization_id}
          reporterId={appSession.profile.id}
          onClose={() => setDamageVehicle(null)}
        />
      ) : null}
      {damageReviewTarget && canManage && appSession ? (
        <DamageStatusPanel
          report={damageReviewTarget}
          managerId={appSession.profile.id}
          onClose={() => setDamageReviewTarget(null)}
        />
      ) : null}
      {maintenanceEditorOpen && canManage && appSession ? (
        <MaintenanceEditor
          vehicles={vehicles}
          organizationId={appSession.profile.organization_id}
          createdBy={appSession.profile.id}
          onClose={() => setMaintenanceEditorOpen(false)}
        />
      ) : null}
      {maintenanceCompleteTarget && canManage ? (
        <MaintenanceCompletePanel
          event={maintenanceCompleteTarget}
          onClose={() => setMaintenanceCompleteTarget(null)}
        />
      ) : null}
      {editingVehicle && canManage && appSession ? (
        <VehicleEditor
          vehicle={editingVehicle === "new" ? null : editingVehicle}
          people={peopleQuery.data ?? []}
          organizationId={appSession.profile.organization_id}
          onClose={() => setEditingVehicle(null)}
        />
      ) : null}
      {reviewTarget && canManageMileage ? (
        <MileageReviewPanel
          submission={reviewTarget}
          onClose={() => setReviewTarget(null)}
        />
      ) : null}

      <div className="wf-stat-grid">
        <div className="wf-stat">
          <strong>{displayedVehicles.length}</strong>
          <span>
            {canViewAll ? "sichtbare Fahrzeuge" : "zugewiesene Fahrzeuge"}
          </span>
        </div>
        <div className="wf-stat">
          <strong>{reportedThisMonth ? "Erledigt" : "Offen"}</strong>
          <span>eigene Monatsmeldung</span>
        </div>
        {canViewAll ? (
          <div className="wf-stat">
            <strong>
              {
                vehicles.filter(
                  (vehicle) =>
                    vehicle.status === "workshop" ||
                    vehicle.status === "out_of_service",
                ).length
              }
            </strong>
            <span>nicht einsatzbereit</span>
          </div>
        ) : null}
        <div className="wf-stat">
          <strong>
            {damageQuery.isLoading
              ? "…"
              : damageQuery.error
                ? "–"
                : openDamageReports.length}
          </strong>
          <span>offene Schadensmeldungen</span>
        </div>
        {canManage ? (
          <div className="wf-stat">
            <strong>
              {maintenanceQuery.isLoading
                ? "…"
                : maintenanceQuery.error
                  ? "–"
                  : dueMaintenanceCount}
            </strong>
            <span>fällige Wartungen</span>
          </div>
        ) : null}
      </div>

      {vehiclesQuery.isLoading ? (
        <LoadingState label="Fahrzeuge werden geladen …" />
      ) : null}
      {vehiclesQuery.error ? (
        <ErrorState onRetry={() => void vehiclesQuery.refetch()} />
      ) : null}
      {!vehiclesQuery.isLoading &&
      !vehiclesQuery.error &&
      displayedVehicles.length === 0 ? (
        <EmptyState
          title="Kein Fahrzeug zugewiesen"
          description={
            canManage
              ? "Legen Sie das erste Fahrzeug an und weisen Sie es einer Person zu."
              : "Sobald der Fuhrpark Ihnen ein Fahrzeug zuweist, können Sie hier den Kilometerstand melden."
          }
          action={
            canManage ? (
              <button
                type="button"
                className="wf-secondary"
                onClick={() => setEditingVehicle("new")}
              >
                <Plus size={18} /> Fahrzeug anlegen
              </button>
            ) : null
          }
        />
      ) : null}
      {!vehiclesQuery.isLoading &&
      !vehiclesQuery.error &&
      displayedVehicles.length > 0 ? (
        <div className="fleet-grid">
          {displayedVehicles.map((vehicle) => {
            const status =
              vehicleStatusMeta[vehicle.status] ?? vehicleStatusMeta.active;
            const activeAssignment = vehicle.vehicle_assignments.find(
              (assignment) =>
                assignment.valid_from <= todayInputValue() &&
                (!assignment.valid_until ||
                  assignment.valid_until >= todayInputValue()),
            );
            const latest = submissions.find(
              (submission) => submission.vehicle_id === vehicle.id,
            );
            return (
              <article className="fleet-card" key={vehicle.id}>
                <header>
                  <span className="fleet-car-icon">
                    <Car />
                  </span>
                  <div>
                    <h3>{vehicle.internal_name}</h3>
                    <strong>{vehicle.license_plate}</strong>
                  </div>
                  <StatusPill label={status.label} tone={status.tone} />
                </header>
                <div className="fleet-model">
                  {[vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
                    "Fahrzeugdetails nicht hinterlegt"}
                </div>
                <dl>
                  <div>
                    <dt>Aktueller Stand</dt>
                    <dd>
                      {Number(vehicle.current_mileage).toLocaleString("de-DE")}{" "}
                      km
                    </dd>
                  </div>
                  <div>
                    <dt>Nächste Wartung</dt>
                    <dd>
                      {vehicle.next_service_on
                        ? format(
                            parseISO(vehicle.next_service_on),
                            "dd.MM.yyyy",
                          )
                        : "Nicht hinterlegt"}
                    </dd>
                  </div>
                </dl>
                {activeAssignment ? (
                  <p className="fleet-assignment">
                    <UserRound />
                    {activeAssignment.profiles?.display_name ?? "Zugewiesen"}
                    {activeAssignment.primary_assignment
                      ? " · Primärfahrzeug"
                      : ""}
                  </p>
                ) : (
                  <p className="fleet-assignment muted">
                    <MapPin />
                    Nicht zugewiesen
                  </p>
                )}
                {latest ? (
                  <p className="fleet-latest">
                    <Gauge />
                    Letzte Meldung:{" "}
                    {Number(latest.mileage).toLocaleString("de-DE")} km am{" "}
                    {format(parseISO(latest.read_on), "dd.MM.yyyy")}
                  </p>
                ) : null}
                <div className="wf-card-actions">
                  {canSubmitMileage &&
                  vehicle.status === "active" &&
                  ownVehicles.some((own) => own.id === vehicle.id) ? (
                    <button
                      type="button"
                      className="wf-primary"
                      onClick={() => setMileageVehicle(vehicle)}
                    >
                      <Gauge size={17} /> Kilometerstand melden
                    </button>
                  ) : null}
                  {canManage ||
                  ownVehicles.some((own) => own.id === vehicle.id) ? (
                    <button
                      type="button"
                      className="wf-secondary"
                      onClick={() => setDamageVehicle(vehicle)}
                    >
                      <AlertTriangle size={17} /> Schaden melden
                    </button>
                  ) : null}
                  {canManage ? (
                    <button
                      type="button"
                      className="wf-quiet"
                      onClick={() => setEditingVehicle(vehicle)}
                    >
                      <Pencil size={16} /> Bearbeiten
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <section className="wf-panel fleet-operation-panel">
        <header className="wf-panel-heading fleet-operation-heading">
          <div>
            <h3>Schadensmeldungen</h3>
            <p>
              Schäden am zugewiesenen Fahrzeug nachvollziehbar melden und durch
              den Fuhrpark bearbeiten lassen.
            </p>
          </div>
          {reportableVehicles.length ? (
            <button
              type="button"
              className="wf-secondary"
              onClick={() => setDamageVehicle(reportableVehicles[0])}
            >
              <AlertTriangle size={18} /> Schaden melden
            </button>
          ) : null}
        </header>
        {damageQuery.isLoading ? (
          <LoadingState label="Schadensmeldungen werden geladen …" />
        ) : damageQuery.error ? (
          <ErrorState
            title="Schadensmeldungen konnten nicht geladen werden"
            onRetry={() => void damageQuery.refetch()}
          />
        ) : damageReports.length === 0 ? (
          <EmptyState
            title="Keine Schadensmeldungen"
            description="Neue Meldungen und ihr Bearbeitungsstatus erscheinen hier."
            action={
              reportableVehicles.length ? (
                <button
                  type="button"
                  className="wf-secondary"
                  onClick={() => setDamageVehicle(reportableVehicles[0])}
                >
                  <AlertTriangle size={18} /> Schaden erfassen
                </button>
              ) : null
            }
          />
        ) : (
          <div className="fleet-operation-list">
            {damageReports.map((report) => {
              const status = damageStatusMeta[report.status];
              return (
                <article className="fleet-operation-card" key={report.id}>
                  <div className="fleet-operation-card-heading">
                    <div>
                      <span className="fleet-operation-kind">
                        <AlertTriangle /> Schadensmeldung
                      </span>
                      <h4>
                        {report.vehicles?.internal_name ?? "Fahrzeug"} ·{" "}
                        {report.vehicles?.license_plate ?? "ohne Kennzeichen"}
                      </h4>
                    </div>
                    <StatusPill label={status.label} tone={status.tone} />
                  </div>
                  <div className="wf-meta">
                    <span>
                      <CalendarDays />
                      Schaden vom{" "}
                      {report.occurred_on
                        ? format(parseISO(report.occurred_on), "dd.MM.yyyy")
                        : "Datum nicht angegeben"}
                    </span>
                    <span>
                      <UserRound />
                      {report.profiles?.display_name ?? "Gemeldete Person"}
                    </span>
                  </div>
                  <p className="fleet-operation-description">
                    {report.description}
                  </p>
                  {canManage ? (
                    <div className="wf-card-actions">
                      <button
                        type="button"
                        className="wf-secondary"
                        onClick={() => setDamageReviewTarget(report)}
                      >
                        <ClipboardCheck size={17} /> Status bearbeiten
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {canManage ? (
        <section className="wf-panel fleet-operation-panel">
          <header className="wf-panel-heading fleet-operation-heading">
            <div>
              <h3>Wartungen & Termine</h3>
              <p>
                Service, Prüfungen und Reparaturen planen und nach Durchführung
                abschließen.
              </p>
            </div>
            <button
              type="button"
              className="wf-primary"
              onClick={() => setMaintenanceEditorOpen(true)}
              disabled={vehicles.length === 0}
            >
              <Plus size={18} /> Wartung planen
            </button>
          </header>
          <div className="fleet-operation-toolbar">
            <span>
              {dueMaintenanceCount === 1
                ? "1 Termin ist fällig."
                : `${dueMaintenanceCount} Termine sind fällig.`}
            </span>
            <select
              className="wf-filter"
              value={maintenanceFilter}
              onChange={(event) =>
                setMaintenanceFilter(event.target.value as "open" | "all")
              }
              aria-label="Wartungsstatus filtern"
            >
              <option value="open">Nur offene Termine</option>
              <option value="all">Alle Termine</option>
            </select>
          </div>
          {maintenanceQuery.isLoading ? (
            <LoadingState label="Wartungstermine werden geladen …" />
          ) : maintenanceQuery.error ? (
            <ErrorState
              title="Wartungstermine konnten nicht geladen werden"
              onRetry={() => void maintenanceQuery.refetch()}
            />
          ) : visibleMaintenanceEvents.length === 0 ? (
            <EmptyState
              title={
                maintenanceFilter === "open"
                  ? "Keine offenen Wartungen"
                  : "Noch keine Wartungen"
              }
              description={
                maintenanceFilter === "open"
                  ? "Aktuell ist kein Wartungs- oder Prüftermin offen."
                  : "Geplante und abgeschlossene Termine erscheinen hier."
              }
              action={
                vehicles.length ? (
                  <button
                    type="button"
                    className="wf-secondary"
                    onClick={() => setMaintenanceEditorOpen(true)}
                  >
                    <Wrench size={18} /> Ersten Termin planen
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="fleet-operation-list">
              {visibleMaintenanceEvents.map((event) => {
                const calculatedDue = isMaintenanceDue(event);
                const shownStatus = calculatedDue ? "due" : event.status;
                const status = maintenanceStatusMeta[shownStatus];
                return (
                  <article className="fleet-operation-card" key={event.id}>
                    <div className="fleet-operation-card-heading">
                      <div>
                        <span className="fleet-operation-kind">
                          <Wrench /> {maintenanceTypeLabels[event.event_type]}
                        </span>
                        <h4>{event.title}</h4>
                        <p>
                          {event.vehicles?.internal_name ?? "Fahrzeug"} ·{" "}
                          {event.vehicles?.license_plate ?? "ohne Kennzeichen"}
                        </p>
                      </div>
                      <StatusPill label={status.label} tone={status.tone} />
                    </div>
                    <div className="wf-meta">
                      {event.due_on ? (
                        <span>
                          <CalendarDays /> Fällig am{" "}
                          {format(parseISO(event.due_on), "dd.MM.yyyy")}
                        </span>
                      ) : null}
                      {event.due_mileage !== null ? (
                        <span>
                          <Gauge /> Bei{" "}
                          {Number(event.due_mileage).toLocaleString("de-DE")} km
                        </span>
                      ) : null}
                      {event.completed_on ? (
                        <span>
                          <Check /> Abgeschlossen am{" "}
                          {format(parseISO(event.completed_on), "dd.MM.yyyy")}
                        </span>
                      ) : null}
                    </div>
                    {event.notes ? (
                      <p className="fleet-operation-description">
                        {event.notes}
                      </p>
                    ) : null}
                    {event.status === "planned" || event.status === "due" ? (
                      <div className="wf-card-actions">
                        <button
                          type="button"
                          className="wf-primary"
                          onClick={() => setMaintenanceCompleteTarget(event)}
                        >
                          <Check size={17} /> Wartung abschließen
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      <section className="wf-panel">
        <header className="wf-panel-heading">
          <div>
            <h3>Historie der Kilometerstände</h3>
            <p>
              {canManageMileage
                ? "Alle für Sie freigegebenen Meldungen."
                : "Ihre letzten Meldungen."}
            </p>
          </div>
        </header>
        {mileageQuery.isLoading ? (
          <LoadingState label="Meldungen werden geladen …" />
        ) : mileageQuery.error ? (
          <ErrorState onRetry={() => void mileageQuery.refetch()} />
        ) : (canManageMileage ? submissions : ownSubmissions).length === 0 ? (
          <EmptyState
            title="Noch keine Meldung"
            description="Gespeicherte Kilometerstände erscheinen chronologisch an dieser Stelle."
          />
        ) : (
          <div className="fleet-history">
            {(canManageMileage ? submissions : ownSubmissions).map(
              (submission) => {
                const status =
                  mileageStatusMeta[submission.status] ??
                  mileageStatusMeta.submitted;
                const reviewable =
                  canManageMileage &&
                  (submission.status === "submitted" ||
                    submission.status === "flagged");
                return (
                  <article key={submission.id}>
                    <span className="fleet-history-icon">
                      <Gauge />
                    </span>
                    <div>
                      <strong>
                        {Number(submission.mileage).toLocaleString("de-DE")} km
                      </strong>
                      <p>
                        {submission.vehicles?.license_plate ?? "Fahrzeug"} ·
                        abgelesen am{" "}
                        {format(parseISO(submission.read_on), "dd.MM.yyyy")}
                        {canManageMileage && submission.profiles
                          ? ` · ${submission.profiles.display_name}`
                          : ""}
                      </p>
                    </div>
                    <div className="fleet-history-status">
                      <StatusPill label={status.label} tone={status.tone} />
                      {reviewable ? (
                        <button
                          type="button"
                          className="wf-secondary"
                          onClick={() => setReviewTarget(submission)}
                        >
                          <Check size={16} /> Prüfen
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              },
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function DamageReportForm({
  vehicle,
  vehicles,
  organizationId,
  reporterId,
  onClose,
}: {
  vehicle: Vehicle;
  vehicles: Vehicle[];
  organizationId: string;
  reporterId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DamageFormValues>({
    resolver: zodResolver(damageSchema),
    defaultValues: {
      vehicleId: vehicle.id,
      occurredOn: todayInputValue(),
      description: "",
    },
  });
  const submit = useMutation({
    mutationFn: async (values: DamageFormValues) => {
      const { data, error } = await supabase
        .from("vehicle_damage_reports")
        .insert({
          organization_id: organizationId,
          vehicle_id: values.vehicleId,
          reported_by: reporterId,
          occurred_on: values.occurredOn,
          description: values.description.trim(),
          status: "reported",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["vehicle-damage-reports"],
      });
      onClose();
    },
  });
  return (
    <WorkflowPanel
      title="Schaden melden"
      description="Beschreiben Sie nur den Fahrzeugschaden und den Hergang. Tragen Sie keine Patienten- oder Gesundheitsdaten ein."
      onClose={onClose}
    >
      <form
        className="wf-form"
        onSubmit={handleSubmit((values) => submit.mutate(values))}
        noValidate
      >
        <div className="wf-form-grid">
          <label className="wf-field">
            <span>Fahrzeug</span>
            <select
              {...register("vehicleId")}
              aria-invalid={Boolean(errors.vehicleId)}
            >
              {vehicles.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.license_plate} · {option.internal_name}
                </option>
              ))}
            </select>
            <FieldError>{errors.vehicleId?.message}</FieldError>
          </label>
          <label className="wf-field">
            <span>Schadensdatum</span>
            <input
              type="date"
              max={todayInputValue()}
              {...register("occurredOn")}
              aria-invalid={Boolean(errors.occurredOn)}
            />
            <FieldError>{errors.occurredOn?.message}</FieldError>
          </label>
        </div>
        <label className="wf-field">
          <span>
            Beschreibung <small>10 bis 4.000 Zeichen</small>
          </span>
          <textarea
            {...register("description")}
            rows={5}
            maxLength={4000}
            placeholder="Wo befindet sich der Schaden und was ist passiert?"
            aria-invalid={Boolean(errors.description)}
          />
          <FieldError>{errors.description?.message}</FieldError>
        </label>
        <MutationNotice kind="error">
          {submit.error
            ? humanizeError(
                submit.error,
                "Die Schadensmeldung konnte nicht gespeichert werden.",
              )
            : null}
        </MutationNotice>
        <div className="wf-form-actions">
          <button type="button" className="wf-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="submit"
            className="wf-primary"
            disabled={submit.isPending}
          >
            <AlertTriangle size={18} />
            {submit.isPending
              ? "Wird gemeldet …"
              : "Schaden verbindlich melden"}
          </button>
        </div>
      </form>
    </WorkflowPanel>
  );
}

function DamageStatusPanel({
  report,
  managerId,
  onClose,
}: {
  report: DamageReport;
  managerId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DamageStatus>(report.status);
  const save = useMutation({
    mutationFn: async () => {
      const resolved = status === "resolved";
      const { data, error } = await supabase
        .from("vehicle_damage_reports")
        .update({
          status,
          resolved_by: resolved ? managerId : null,
          resolved_at: resolved ? new Date().toISOString() : null,
        })
        .eq("id", report.id)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["vehicle-damage-reports"],
      });
      onClose();
    },
  });
  return (
    <WorkflowPanel
      title="Schadensstatus bearbeiten"
      description={`${report.vehicles?.license_plate ?? "Fahrzeug"} · gemeldet ${format(parseISO(report.created_at), "dd.MM.yyyy")}`}
      onClose={onClose}
    >
      <div className="wf-form">
        <p className="fleet-form-summary">{report.description}</p>
        <label className="wf-field">
          <span>Bearbeitungsstatus</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as DamageStatus)}
          >
            {(Object.keys(damageStatusMeta) as DamageStatus[]).map((option) => (
              <option key={option} value={option}>
                {damageStatusMeta[option].label}
              </option>
            ))}
          </select>
        </label>
        <MutationNotice kind="info">
          {status === "resolved"
            ? "Beim Speichern wird die Meldung mit aktuellem Zeitpunkt als erledigt dokumentiert."
            : null}
        </MutationNotice>
        <MutationNotice kind="error">
          {save.error
            ? humanizeError(
                save.error,
                "Der Schadensstatus konnte nicht gespeichert werden.",
              )
            : null}
        </MutationNotice>
        <div className="wf-form-actions">
          <button type="button" className="wf-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="wf-primary"
            disabled={save.isPending || status === report.status}
            onClick={() => save.mutate()}
          >
            <ClipboardCheck size={18} />
            {save.isPending ? "Wird gespeichert …" : "Status speichern"}
          </button>
        </div>
      </div>
    </WorkflowPanel>
  );
}

function MaintenanceEditor({
  vehicles,
  organizationId,
  createdBy,
  onClose,
}: {
  vehicles: Vehicle[];
  organizationId: string;
  createdBy: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: {
      vehicleId: vehicles[0]?.id ?? "",
      eventType: "service",
      title: "",
      dueOn: "",
      dueMileage: "",
      notes: "",
    },
  });
  const save = useMutation({
    mutationFn: async (values: MaintenanceFormValues) => {
      const selectedVehicle = vehicles.find(
        (vehicle) => vehicle.id === values.vehicleId,
      );
      if (!selectedVehicle) throw new Error("Fahrzeug nicht verfügbar");
      const dueMileage = values.dueMileage ? Number(values.dueMileage) : null;
      const isDue = Boolean(
        (values.dueOn && values.dueOn <= todayInputValue()) ||
        (dueMileage !== null && dueMileage <= selectedVehicle.current_mileage),
      );
      const { data, error } = await supabase
        .from("vehicle_maintenance_events")
        .insert({
          organization_id: organizationId,
          vehicle_id: values.vehicleId,
          event_type: values.eventType,
          title: values.title.trim(),
          due_on: values.dueOn || null,
          due_mileage: dueMileage,
          status: isDue ? "due" : "planned",
          notes: values.notes.trim() || null,
          created_by: createdBy,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["vehicle-maintenance-events"],
      });
      onClose();
    },
  });
  return (
    <WorkflowPanel
      title="Wartung planen"
      description="Legen Sie mindestens ein Fälligkeitsdatum oder einen Ziel-Kilometerstand fest."
      onClose={onClose}
    >
      <form
        className="wf-form"
        onSubmit={handleSubmit((values) => save.mutate(values))}
        noValidate
      >
        <div className="wf-form-grid">
          <label className="wf-field">
            <span>Fahrzeug</span>
            <select
              {...register("vehicleId")}
              aria-invalid={Boolean(errors.vehicleId)}
            >
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.license_plate} · {vehicle.internal_name}
                </option>
              ))}
            </select>
            <FieldError>{errors.vehicleId?.message}</FieldError>
          </label>
          <label className="wf-field">
            <span>Art</span>
            <select {...register("eventType")}>
              {(
                Object.keys(maintenanceTypeLabels) as MaintenanceEventType[]
              ).map((eventType) => (
                <option key={eventType} value={eventType}>
                  {maintenanceTypeLabels[eventType]}
                </option>
              ))}
            </select>
          </label>
          <label className="wf-field fleet-field-wide">
            <span>Bezeichnung</span>
            <input
              {...register("title")}
              maxLength={160}
              placeholder="z. B. Jahresinspektion"
              aria-invalid={Boolean(errors.title)}
            />
            <FieldError>{errors.title?.message}</FieldError>
          </label>
          <label className="wf-field">
            <span>Fällig am</span>
            <input
              type="date"
              {...register("dueOn")}
              aria-invalid={Boolean(errors.dueOn)}
            />
            <FieldError>{errors.dueOn?.message}</FieldError>
          </label>
          <label className="wf-field">
            <span>Fällig bei Kilometerstand</span>
            <input
              type="number"
              min="0"
              max="9999999"
              step="1"
              inputMode="numeric"
              {...register("dueMileage")}
              aria-invalid={Boolean(errors.dueMileage)}
              placeholder="z. B. 80000"
            />
            <FieldError>{errors.dueMileage?.message}</FieldError>
          </label>
        </div>
        <label className="wf-field">
          <span>
            Interne Notiz <small>optional, max. 2.000 Zeichen</small>
          </span>
          <textarea
            {...register("notes")}
            maxLength={2000}
            placeholder="Werkstatt, Umfang oder organisatorische Hinweise …"
            aria-invalid={Boolean(errors.notes)}
          />
          <FieldError>{errors.notes?.message}</FieldError>
        </label>
        <MutationNotice kind="error">
          {save.error
            ? humanizeError(
                save.error,
                "Der Wartungstermin konnte nicht gespeichert werden.",
              )
            : null}
        </MutationNotice>
        <div className="wf-form-actions">
          <button type="button" className="wf-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="submit"
            className="wf-primary"
            disabled={save.isPending || vehicles.length === 0}
          >
            <Wrench size={18} />
            {save.isPending ? "Wird gespeichert …" : "Wartung speichern"}
          </button>
        </div>
      </form>
    </WorkflowPanel>
  );
}

function MaintenanceCompletePanel({
  event,
  onClose,
}: {
  event: MaintenanceEvent;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MaintenanceCompleteFormValues>({
    resolver: zodResolver(maintenanceCompleteSchema),
    defaultValues: {
      completedOn: todayInputValue(),
      completedMileage:
        event.vehicles?.current_mileage === undefined
          ? ""
          : String(event.vehicles.current_mileage),
    },
  });
  const complete = useMutation({
    mutationFn: async (values: MaintenanceCompleteFormValues) => {
      const { data, error } = await supabase
        .from("vehicle_maintenance_events")
        .update({
          status: "completed",
          completed_on: values.completedOn,
          completed_mileage: values.completedMileage
            ? Number(values.completedMileage)
            : null,
        })
        .eq("id", event.id)
        .in("status", ["planned", "due"])
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["vehicle-maintenance-events"],
      });
      onClose();
    },
  });
  return (
    <WorkflowPanel
      title="Wartung abschließen"
      description={`${event.title} · ${event.vehicles?.license_plate ?? "Fahrzeug"}`}
      onClose={onClose}
    >
      <form
        className="wf-form"
        onSubmit={handleSubmit((values) => complete.mutate(values))}
        noValidate
      >
        <div className="wf-form-grid">
          <label className="wf-field">
            <span>Abgeschlossen am</span>
            <input
              type="date"
              max={todayInputValue()}
              {...register("completedOn")}
              aria-invalid={Boolean(errors.completedOn)}
            />
            <FieldError>{errors.completedOn?.message}</FieldError>
          </label>
          <label className="wf-field">
            <span>
              Kilometerstand <small>optional</small>
            </span>
            <input
              type="number"
              min="0"
              max="9999999"
              step="1"
              inputMode="numeric"
              {...register("completedMileage")}
              aria-invalid={Boolean(errors.completedMileage)}
            />
            <FieldError>{errors.completedMileage?.message}</FieldError>
          </label>
        </div>
        <MutationNotice kind="error">
          {complete.error
            ? humanizeError(
                complete.error,
                "Die Wartung konnte nicht abgeschlossen werden.",
              )
            : null}
        </MutationNotice>
        <div className="wf-form-actions">
          <button type="button" className="wf-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="submit"
            className="wf-primary"
            disabled={complete.isPending}
          >
            <Check size={18} />
            {complete.isPending
              ? "Wird abgeschlossen …"
              : "Als abgeschlossen speichern"}
          </button>
        </div>
      </form>
    </WorkflowPanel>
  );
}

function MileageReviewPanel({
  submission,
  onClose,
}: {
  submission: MileageSubmission;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const review = useMutation({
    mutationFn: async (status: "verified" | "rejected") => {
      if (status === "rejected" && !comment.trim())
        throw new Error("Ablehnungsgrund fehlt");
      const { error } = await supabase.rpc("review_mileage_submission", {
        p_submission_id: submission.id,
        p_status: status,
        p_comment: comment.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["mileage-submissions"],
      });
      onClose();
    },
  });
  return (
    <WorkflowPanel
      title="Kilometerstand prüfen"
      description={`${submission.vehicles?.license_plate ?? "Fahrzeug"} · ${Number(submission.mileage).toLocaleString("de-DE")} km am ${format(parseISO(submission.read_on), "dd.MM.yyyy")}`}
      onClose={onClose}
    >
      <div className="wf-form">
        <label className="wf-field">
          <span>
            Prüfkommentar <small>bei Ablehnung erforderlich</small>
          </span>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={1000}
            placeholder="Plausibilitätsprüfung oder Korrekturhinweis …"
          />
        </label>
        <MutationNotice kind="error">
          {review.error
            ? review.error.message === "Ablehnungsgrund fehlt"
              ? "Bitte begründen Sie die Ablehnung."
              : humanizeError(
                  review.error,
                  "Der Prüfstatus konnte nicht gespeichert werden.",
                )
            : null}
        </MutationNotice>
        <div className="wf-form-actions">
          <button
            type="button"
            className="wf-danger"
            disabled={review.isPending || !comment.trim()}
            onClick={() => review.mutate("rejected")}
          >
            Ablehnen
          </button>
          <button
            type="button"
            className="wf-primary"
            disabled={review.isPending}
            onClick={() => review.mutate("verified")}
          >
            <Check size={17} /> Als geprüft markieren
          </button>
        </div>
      </div>
    </WorkflowPanel>
  );
}

function MileageForm({
  vehicle,
  vehicles,
  organizationId,
  onClose,
}: {
  vehicle: Vehicle;
  vehicles: Vehicle[];
  organizationId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [photo, setPhoto] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MileageFormValues>({
    resolver: zodResolver(mileageSchema),
    defaultValues: {
      vehicleId: vehicle.id,
      mileage: vehicle.current_mileage,
      readOn: todayInputValue(),
    },
  });
  const submit = useMutation({
    mutationFn: async (values: MileageFormValues) => {
      let photoPath: string | null = null;
      if (photo) {
        validatePhoto(photo);
        const extension = photo.type === "image/png" ? "png" : "jpg";
        photoPath = `${organizationId}/${values.vehicleId}/mileage/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("vehicle-files")
          .upload(photoPath, photo, { contentType: photo.type });
        if (uploadError) throw uploadError;
      }
      const { data, error } = await supabase.rpc("submit_mileage", {
        p_vehicle_id: values.vehicleId,
        p_mileage: values.mileage,
        p_read_on: values.readOn,
        p_photo_path: photoPath,
      });
      if (error) {
        if (photoPath)
          await supabase.storage.from("vehicle-files").remove([photoPath]);
        throw error;
      }
      return data as string;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mileage-submissions"] }),
        queryClient.invalidateQueries({ queryKey: ["fleet-vehicles"] }),
      ]);
      onClose();
    },
  });
  const selectPhoto = (file: File | null) => {
    setFileError("");
    if (!file) return setPhoto(null);
    try {
      validatePhoto(file);
      setPhoto(file);
    } catch (error) {
      setPhoto(null);
      setFileError(
        error instanceof Error ? error.message : "Foto nicht zulässig.",
      );
    }
  };
  return (
    <WorkflowPanel
      title="Kilometerstand melden"
      description="Der neue Stand wird serverseitig gegen die bisherige Historie geprüft. Eine Monatsmeldung kann nur im vorgesehenen Korrekturworkflow ersetzt werden."
      onClose={onClose}
    >
      <form
        className="wf-form"
        onSubmit={handleSubmit((values) => submit.mutate(values))}
        noValidate
      >
        <div className="wf-form-grid">
          <label className="wf-field">
            <span>Fahrzeug</span>
            <select
              {...register("vehicleId")}
              aria-invalid={Boolean(errors.vehicleId)}
            >
              {vehicles.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.license_plate} · {option.internal_name}
                </option>
              ))}
            </select>
            <FieldError>{errors.vehicleId?.message}</FieldError>
          </label>
          <label className="wf-field">
            <span>Ablesedatum</span>
            <input
              type="date"
              max={todayInputValue()}
              {...register("readOn")}
              aria-invalid={Boolean(errors.readOn)}
            />
            <FieldError>{errors.readOn?.message}</FieldError>
          </label>
        </div>
        <label className="wf-field fleet-mileage-input">
          <span>
            Aktueller Kilometerstand <small>ganze Zahl</small>
          </span>
          <div>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              {...register("mileage", { valueAsNumber: true })}
              aria-invalid={Boolean(errors.mileage)}
            />
            <span>km</span>
          </div>
          <FieldError>{errors.mileage?.message}</FieldError>
        </label>
        <label className="fleet-photo">
          <Camera />
          <span>
            <strong>
              {photo ? photo.name : "Tachofoto hinzufügen (optional)"}
            </strong>
            <small>JPG oder PNG · maximal 10 MB</small>
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,.jpg,.jpeg,.png"
            onChange={(event) => selectPhoto(event.target.files?.[0] ?? null)}
          />
        </label>
        <FieldError>{fileError}</FieldError>
        <MutationNotice kind="error">
          {submit.error
            ? humanizeError(
                submit.error,
                "Der Kilometerstand konnte nicht gespeichert werden. Bitte prüfen Sie den Wert und die Monatsmeldung.",
              )
            : null}
        </MutationNotice>
        <div className="wf-form-actions">
          <button type="button" className="wf-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="submit"
            className="wf-primary"
            disabled={submit.isPending}
          >
            <Save size={18} />
            {submit.isPending
              ? "Wird gespeichert …"
              : "Kilometerstand speichern"}
          </button>
        </div>
      </form>
    </WorkflowPanel>
  );
}

function VehicleEditor({
  vehicle,
  people,
  organizationId,
  onClose,
}: {
  vehicle: Vehicle | null;
  people: Person[];
  organizationId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const activeAssignment = vehicle?.vehicle_assignments.find(
    (assignment) =>
      assignment.valid_from <= todayInputValue() &&
      (!assignment.valid_until || assignment.valid_until >= todayInputValue()),
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      internalName: vehicle?.internal_name ?? "",
      licensePlate: vehicle?.license_plate ?? "",
      make: vehicle?.make ?? "",
      model: vehicle?.model ?? "",
      status: vehicle?.status ?? "active",
      currentMileage: vehicle?.current_mileage ?? 0,
      nextServiceOn: vehicle?.next_service_on ?? "",
      assigneeId: activeAssignment?.profile_id ?? "",
    },
  });
  const save = useMutation({
    mutationFn: async (values: VehicleFormValues) => {
      if (!organizationId) throw new Error("Sitzung fehlt");
      const { data, error } = await supabase.rpc("save_vehicle", {
        p_vehicle_id: vehicle?.id ?? null,
        p_internal_name: values.internalName.trim(),
        p_license_plate: values.licensePlate.trim().toUpperCase(),
        p_make: values.make.trim() || null,
        p_model: values.model.trim() || null,
        p_status: values.status,
        p_current_mileage: values.currentMileage,
        p_next_service_on: values.nextServiceOn || null,
        p_assignee_id: values.assigneeId || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fleet-vehicles"] });
      onClose();
    },
  });
  return (
    <WorkflowPanel
      title={vehicle ? "Fahrzeug bearbeiten" : "Fahrzeug anlegen"}
      description="Stammdaten und die aktuelle primäre Zuweisung werden gemeinsam gespeichert."
      onClose={onClose}
    >
      <form
        className="wf-form"
        onSubmit={handleSubmit((values) => save.mutate(values))}
        noValidate
      >
        <div className="wf-form-grid">
          <label className="wf-field">
            <span>Interne Bezeichnung</span>
            <input
              {...register("internalName")}
              placeholder="z. B. Tourenfahrzeug 12"
              aria-invalid={Boolean(errors.internalName)}
            />
            <FieldError>{errors.internalName?.message}</FieldError>
          </label>
          <label className="wf-field">
            <span>Amtliches Kennzeichen</span>
            <input
              {...register("licensePlate")}
              placeholder="AC-AB 123"
              aria-invalid={Boolean(errors.licensePlate)}
            />
            <FieldError>{errors.licensePlate?.message}</FieldError>
          </label>
          <label className="wf-field">
            <span>Hersteller</span>
            <input {...register("make")} placeholder="Volkswagen" />
          </label>
          <label className="wf-field">
            <span>Modell</span>
            <input {...register("model")} placeholder="up!" />
          </label>
          <label className="wf-field">
            <span>Status</span>
            <select {...register("status")}>
              <option value="active">Aktiv</option>
              <option value="workshop">Werkstatt</option>
              <option value="out_of_service">Außer Betrieb</option>
              <option value="sold">Verkauft</option>
            </select>
          </label>
          <label className="wf-field">
            <span>Aktueller Kilometerstand</span>
            <input
              type="number"
              min="0"
              step="1"
              {...register("currentMileage", { valueAsNumber: true })}
              aria-invalid={Boolean(errors.currentMileage)}
            />
            <FieldError>{errors.currentMileage?.message}</FieldError>
          </label>
          <label className="wf-field">
            <span>Nächste Wartung</span>
            <input type="date" {...register("nextServiceOn")} />
          </label>
          <label className="wf-field">
            <span>Primär zugewiesen an</span>
            <select {...register("assigneeId")}>
              <option value="">Keine Zuweisung</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.display_name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <MutationNotice kind="error">
          {save.error
            ? humanizeError(
                save.error,
                "Das Fahrzeug konnte nicht gespeichert werden.",
              )
            : null}
        </MutationNotice>
        <div className="wf-form-actions">
          <button type="button" className="wf-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="submit"
            className="wf-primary"
            disabled={save.isPending}
          >
            <Wrench size={18} />
            {save.isPending ? "Wird gespeichert …" : "Fahrzeug speichern"}
          </button>
        </div>
      </form>
    </WorkflowPanel>
  );
}

export function FleetAdminPage() {
  return <FleetPage />;
}
