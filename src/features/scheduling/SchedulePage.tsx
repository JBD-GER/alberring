import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInMinutes,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { de } from "date-fns/locale";
import {
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  ListFilter,
  MapPin,
  Pencil,
  Plus,
  Search,
  UserCheck,
  Users,
} from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import {
  EmptyState,
  ErrorState,
  FieldError,
  humanizeError,
  LoadingState,
  MutationNotice,
  StatusPill,
  toLocalDateTimeInput,
  WorkflowHeader,
  WorkflowPanel,
  WorkflowTabs,
  type StatusTone,
} from "../../components/form/WorkflowUI";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import "./scheduling.css";

type ScheduleView = "agenda" | "week" | "month";
type ShiftStatus = "draft" | "published" | "changed" | "cancelled";
type ShiftStatusFilter = "all" | ShiftStatus;
type Team = { id: string; name: string; location_name: string | null };
type Person = { id: string; display_name: string };
type Assignment = {
  profile_id: string;
  acknowledged_at: string | null;
  profiles: Person | null;
};
type Shift = {
  id: string;
  team_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  status: ShiftStatus;
  teams: Team | null;
  shift_assignments: Assignment[];
};

const shiftSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "Bitte eine Bezeichnung eingeben.")
      .max(100, "Maximal 100 Zeichen."),
    teamId: z.string(),
    startsAt: z.string().min(1, "Startzeit fehlt."),
    endsAt: z.string().min(1, "Endzeit fehlt."),
    assigneeIds: z
      .array(z.string())
      .min(1, "Mindestens eine Person auswählen."),
    status: z.enum(["draft", "published", "changed", "cancelled"]),
  })
  .refine((values) => new Date(values.endsAt) > new Date(values.startsAt), {
    message: "Das Ende muss nach dem Beginn liegen.",
    path: ["endsAt"],
  });

type ShiftFormValues = z.infer<typeof shiftSchema>;

const statusMeta: Record<ShiftStatus, { label: string; tone: StatusTone }> = {
  draft: { label: "Entwurf", tone: "neutral" },
  published: { label: "Geplant", tone: "success" },
  changed: { label: "Geändert", tone: "warning" },
  cancelled: { label: "Abgesagt", tone: "danger" },
};

const statusOptions: Array<{ value: ShiftStatusFilter; label: string }> = [
  { value: "all", label: "Alle Status" },
  { value: "published", label: "Geplant" },
  { value: "changed", label: "Geändert" },
  { value: "draft", label: "Entwurf" },
  { value: "cancelled", label: "Abgesagt" },
];

function initialShiftValues(): ShiftFormValues {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 8 * 60 * 60 * 1000);
  return {
    title: "",
    teamId: "",
    startsAt: toLocalDateTimeInput(start),
    endsAt: toLocalDateTimeInput(end),
    assigneeIds: [],
    status: "draft",
  };
}

function periodRange(view: ScheduleView, cursor: Date) {
  if (view === "month") {
    return {
      start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
      end: addDays(endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }), 1),
    };
  }
  return {
    start: startOfWeek(cursor, { weekStartsOn: 1 }),
    end: addDays(endOfWeek(cursor, { weekStartsOn: 1 }), 1),
  };
}

function periodLabel(view: ScheduleView, cursor: Date) {
  if (view === "month") return format(cursor, "MMMM yyyy", { locale: de });
  if (view === "agenda")
    return format(cursor, "EEEE, dd. MMMM yyyy", { locale: de });
  const start = startOfWeek(cursor, { weekStartsOn: 1 });
  const end = endOfWeek(cursor, { weekStartsOn: 1 });
  return `${format(start, "dd. MMM.", { locale: de })} – ${format(end, "dd. MMM. yyyy", { locale: de })}`;
}

function durationLabel(startsAt: string | Date, endsAt: string | Date) {
  const minutes = differenceInMinutes(new Date(endsAt), new Date(startsAt));
  if (minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} Min.`;
  return remainder ? `${hours} Std. ${remainder} Min.` : `${hours} Std.`;
}

export function SchedulePage() {
  const { appSession, has } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<ScheduleView>("agenda");
  const [cursor, setCursor] = useState(() => new Date());
  const [teamFilter, setTeamFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<ShiftStatusFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);
  const canManage = has("schedule.manage");
  const canPublish = has("schedule.publish");
  const canSeeTeam = has("schedule.view_team");
  const range = useMemo(() => periodRange(view, cursor), [cursor, view]);

  const shiftsQuery = useQuery({
    queryKey: ["schedule", range.start.toISOString(), range.end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select(
          "id,team_id,title,starts_at,ends_at,status,teams(id,name,location_name),shift_assignments(profile_id,acknowledged_at,profiles(id,display_name))",
        )
        .gte("starts_at", range.start.toISOString())
        .lt("starts_at", range.end.toISOString())
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data as unknown as Shift[];
    },
  });

  const teamsQuery = useQuery({
    queryKey: ["schedule-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id,name,location_name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Team[];
    },
    enabled: canSeeTeam || canManage,
  });

  const peopleQuery = useQuery({
    queryKey: ["schedule-people"],
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

  const acknowledge = useMutation({
    mutationFn: async (shiftId: string) => {
      const { error } = await supabase.rpc("acknowledge_shift", {
        p_shift_id: shiftId,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["schedule"] }),
  });

  const periodShifts = useMemo(
    () =>
      (shiftsQuery.data ?? []).filter(
        (shift) =>
          (teamFilter === "all" || shift.team_id === teamFilter) &&
          (statusFilter === "all" || shift.status === statusFilter),
      ),
    [shiftsQuery.data, statusFilter, teamFilter],
  );
  const shifts = useMemo(() => {
    if (view === "agenda") {
      return periodShifts.filter((shift) =>
        isSameDay(new Date(shift.starts_at), cursor),
      );
    }
    if (view === "month") {
      return periodShifts.filter((shift) =>
        isSameMonth(new Date(shift.starts_at), cursor),
      );
    }
    return periodShifts;
  }, [cursor, periodShifts, view]);
  const move = (direction: -1 | 1) => {
    if (view === "month") setCursor((value) => addMonths(value, direction));
    else if (view === "week") setCursor((value) => addWeeks(value, direction));
    else setCursor((value) => addDays(value, direction));
  };
  const selectDay = (day: Date) => {
    setCursor(day);
    setView("agenda");
  };
  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (shift: Shift) => {
    setEditing(shift);
    setFormOpen(true);
  };

  return (
    <div className="wf-page schedule-page">
      <WorkflowHeader
        eyebrow="Einsatz- & Schichtplanung"
        title="Mein Dienstplan"
        description={
          canSeeTeam
            ? "Dienste, Besetzung und Rückmeldungen auf einen Blick."
            : "Alle anstehenden Dienste, Änderungen und Bestätigungen auf einen Blick."
        }
        action={
          canManage ? (
            <button type="button" className="wf-primary" onClick={openNew}>
              <Plus size={19} /> Schicht anlegen
            </button>
          ) : null
        }
      />

      {formOpen && canManage ? (
        <ShiftEditor
          key={editing?.id ?? "new"}
          shift={editing}
          teams={teamsQuery.data ?? []}
          people={peopleQuery.data ?? []}
          canPublish={canPublish}
          organizationId={appSession?.profile.organization_id ?? ""}
          onSaved={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onClose={() => setFormOpen(false)}
        />
      ) : null}

      <section className="schedule-controls" aria-label="Dienstplan steuern">
        <div className="wf-toolbar schedule-toolbar">
          <WorkflowTabs
            value={view}
            onChange={setView}
            label="Planungsansicht"
            options={[
              { value: "agenda", label: "Agenda" },
              { value: "week", label: "Woche" },
              { value: "month", label: "Monat" },
            ]}
          />
          <div className="schedule-filter-bar">
            <ListFilter aria-hidden="true" />
            {(canSeeTeam || canManage) && (teamsQuery.data?.length ?? 0) > 0 ? (
              <label>
                <span className="wf-sr-only">Team</span>
                <select
                  className="wf-filter"
                  value={teamFilter}
                  onChange={(event) => setTeamFilter(event.target.value)}
                  aria-label="Nach Team filtern"
                >
                  <option value="all">Alle Teams</option>
                  {teamsQuery.data?.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              <span className="wf-sr-only">Status</span>
              <select
                className="wf-filter"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as ShiftStatusFilter)
                }
                aria-label="Nach Status filtern"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {teamFilter !== "all" || statusFilter !== "all" ? (
              <button
                type="button"
                className="schedule-filter-reset"
                onClick={() => {
                  setTeamFilter("all");
                  setStatusFilter("all");
                }}
              >
                Zurücksetzen
              </button>
            ) : null}
          </div>
        </div>

        <nav className="schedule-period-nav" aria-label="Zeitraum wechseln">
          <button
            type="button"
            className="wf-icon-button"
            onClick={() => move(-1)}
            aria-label="Vorheriger Zeitraum"
          >
            <ChevronLeft />
          </button>
          <div className="schedule-period-heading">
            <CalendarDays aria-hidden="true" />
            <span>
              <small>
                {view === "agenda"
                  ? isToday(cursor)
                    ? "Heute"
                    : "Ausgewählter Tag"
                  : view === "week"
                    ? "Kalenderwoche"
                    : "Monatsübersicht"}
              </small>
              <strong>{periodLabel(view, cursor)}</strong>
            </span>
          </div>
          {!isToday(cursor) ? (
            <button
              type="button"
              className="schedule-today-button"
              onClick={() => setCursor(new Date())}
            >
              Heute
            </button>
          ) : (
            <span className="schedule-today-spacer" aria-hidden="true" />
          )}
          <button
            type="button"
            className="wf-icon-button"
            onClick={() => move(1)}
            aria-label="Nächster Zeitraum"
          >
            <ChevronRight />
          </button>
        </nav>

        {view === "agenda" ? (
          <ScheduleDayPicker
            cursor={cursor}
            shifts={periodShifts}
            onChange={setCursor}
          />
        ) : null}
      </section>

      {shiftsQuery.isLoading ? (
        <LoadingState label="Dienstplan wird geladen …" />
      ) : null}
      {shiftsQuery.error ? (
        <ErrorState onRetry={() => void shiftsQuery.refetch()} />
      ) : null}
      {!shiftsQuery.isLoading && !shiftsQuery.error && shifts.length === 0 ? (
        <EmptyState
          title={
            teamFilter !== "all" || statusFilter !== "all"
              ? "Keine passenden Dienste"
              : view === "agenda"
                ? isToday(cursor)
                  ? "Heute ist kein Dienst geplant"
                  : "An diesem Tag ist kein Dienst geplant"
                : "Keine Dienste in diesem Zeitraum"
          }
          description={
            canManage
              ? "Legen Sie einen Dienst an, wechseln Sie den Zeitraum oder passen Sie die Filter an."
              : "Wechseln Sie den Zeitraum oder passen Sie die Filter an."
          }
          action={
            canManage ? (
              <button type="button" className="wf-secondary" onClick={openNew}>
                <Plus size={18} /> Schicht anlegen
              </button>
            ) : null
          }
        />
      ) : null}
      {!shiftsQuery.isLoading && !shiftsQuery.error && shifts.length > 0 ? (
        <>
          <ScheduleOverview
            shifts={shifts}
            canSeeTeam={canSeeTeam || canManage}
          />
          {view === "agenda" ? (
            <ScheduleAgenda
              shifts={shifts}
              me={appSession?.profile.id}
              canManage={canManage}
              onEdit={openEdit}
              acknowledge={acknowledge}
            />
          ) : view === "week" ? (
            <ScheduleWeek
              shifts={shifts}
              cursor={cursor}
              me={appSession?.profile.id}
              canManage={canManage}
              onEdit={openEdit}
              acknowledge={acknowledge}
            />
          ) : (
            <ScheduleMonth
              shifts={shifts}
              cursor={cursor}
              canManage={canManage}
              onEdit={openEdit}
              onSelectDay={selectDay}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

function ScheduleDayPicker({
  cursor,
  shifts,
  onChange,
}: {
  cursor: Date;
  shifts: Shift[];
  onChange: (day: Date) => void;
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(cursor, { weekStartsOn: 1 }),
    end: endOfWeek(cursor, { weekStartsOn: 1 }),
  });

  return (
    <div className="schedule-day-picker" aria-label="Tag auswählen">
      {days.map((day) => {
        const count = shifts.filter((shift) =>
          isSameDay(new Date(shift.starts_at), day),
        ).length;
        const selected = isSameDay(day, cursor);
        return (
          <button
            key={day.toISOString()}
            type="button"
            className={`${selected ? "selected" : ""} ${isToday(day) ? "today" : ""}`}
            aria-pressed={selected}
            aria-label={`${format(day, "EEEE, dd. MMMM", { locale: de })}, ${count || "keine"} ${count === 1 ? "Schicht" : "Schichten"}`}
            onClick={() => onChange(day)}
          >
            <span>{format(day, "EE", { locale: de })}</span>
            <strong>{format(day, "dd")}</strong>
            <small>{count > 0 ? count : "–"}</small>
          </button>
        );
      })}
    </div>
  );
}

function ScheduleOverview({
  shifts,
  canSeeTeam,
}: {
  shifts: Shift[];
  canSeeTeam: boolean;
}) {
  const activeShifts = shifts.filter((shift) => shift.status !== "cancelled");
  const totalMinutes = activeShifts.reduce(
    (total, shift) =>
      total +
      Math.max(
        0,
        differenceInMinutes(new Date(shift.ends_at), new Date(shift.starts_at)),
      ),
    0,
  );
  const people = new Set(
    activeShifts.flatMap((shift) =>
      shift.shift_assignments.map((assignment) => assignment.profile_id),
    ),
  );
  const relevantAssignments = activeShifts.flatMap((shift) =>
    shift.status === "published" || shift.status === "changed"
      ? shift.shift_assignments
      : [],
  );
  const confirmed = relevantAssignments.filter(
    (assignment) => assignment.acknowledged_at,
  ).length;
  const pending = relevantAssignments.length - confirmed;
  const hoursLabel =
    totalMinutes % 60 === 0
      ? `${totalMinutes / 60} Std.`
      : `${Math.floor(totalMinutes / 60)} Std. ${totalMinutes % 60} Min.`;

  return (
    <section className="schedule-overview" aria-label="Planungsübersicht">
      <article>
        <span className="schedule-overview-icon">
          <CalendarCheck aria-hidden="true" />
        </span>
        <div>
          <strong>{shifts.length}</strong>
          <span>{shifts.length === 1 ? "Dienst" : "Dienste"}</span>
        </div>
      </article>
      <article>
        <span className="schedule-overview-icon">
          <Clock3 aria-hidden="true" />
        </span>
        <div>
          <strong>{hoursLabel}</strong>
          <span>Geplante Einsatzzeit</span>
        </div>
      </article>
      {canSeeTeam ? (
        <article>
          <span className="schedule-overview-icon">
            <Users aria-hidden="true" />
          </span>
          <div>
            <strong>{people.size}</strong>
            <span>Teammitglieder eingeplant</span>
          </div>
        </article>
      ) : null}
      <article className={pending > 0 ? "needs-attention" : ""}>
        <span className="schedule-overview-icon">
          {pending > 0 ? (
            <CircleAlert aria-hidden="true" />
          ) : (
            <UserCheck aria-hidden="true" />
          )}
        </span>
        <div>
          <strong>
            {confirmed}/{relevantAssignments.length}
          </strong>
          <span>
            {pending > 0
              ? `${pending} ${pending === 1 ? "Bestätigung" : "Bestätigungen"} offen`
              : "Alle Dienste bestätigt"}
          </span>
        </div>
      </article>
    </section>
  );
}

function ShiftEditor({
  shift,
  teams,
  people,
  canPublish,
  organizationId,
  onSaved,
  onClose,
}: {
  shift: Shift | null;
  teams: Team[];
  people: Person[];
  canPublish: boolean;
  organizationId: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [peopleSearch, setPeopleSearch] = useState("");
  const defaults: ShiftFormValues = shift
    ? {
        title: shift.title,
        teamId: shift.team_id ?? "",
        startsAt: toLocalDateTimeInput(shift.starts_at),
        endsAt: toLocalDateTimeInput(shift.ends_at),
        assigneeIds: shift.shift_assignments.map(
          (assignment) => assignment.profile_id,
        ),
        status: shift.status,
      }
    : initialShiftValues();
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<ShiftFormValues>({
    resolver: zodResolver(shiftSchema),
    defaultValues: defaults,
  });
  const selectedPeople = useWatch({ control, name: "assigneeIds" }) ?? [];
  const startsAt = useWatch({ control, name: "startsAt" });
  const endsAt = useWatch({ control, name: "endsAt" });
  const visiblePeople = useMemo(() => {
    const search = peopleSearch.trim().toLocaleLowerCase("de");
    if (!search) return people;
    return people.filter((person) =>
      person.display_name.toLocaleLowerCase("de").includes(search),
    );
  }, [people, peopleSearch]);
  const save = useMutation({
    mutationFn: async (values: ShiftFormValues) => {
      if (!organizationId) throw new Error("Sitzung fehlt");
      const { data, error } = await supabase.rpc("save_shift", {
        p_shift_id: shift?.id ?? null,
        p_team_id: values.teamId || null,
        p_title: values.title.trim(),
        p_starts_at: new Date(values.startsAt).toISOString(),
        p_ends_at: new Date(values.endsAt).toISOString(),
        p_assignee_ids: values.assigneeIds,
        p_status: canPublish ? values.status : "draft",
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["schedule"] });
      onSaved();
    },
  });

  return (
    <WorkflowPanel
      title={shift ? "Schicht bearbeiten" : "Neue Schicht"}
      description="Konflikte mit anderen Schichten und bestätigten Abwesenheiten werden beim Speichern serverseitig geprüft."
      onClose={onClose}
    >
      <form
        className="wf-form"
        onSubmit={handleSubmit((values) => save.mutate(values))}
        noValidate
      >
        <section className="schedule-editor-section">
          <header>
            <span>
              <CalendarDays aria-hidden="true" />
            </span>
            <div>
              <h4>Dienst & Zeitraum</h4>
              <p>Bezeichnung, Standort und verbindliche Einsatzzeit.</p>
            </div>
          </header>
          <div className="wf-form-grid schedule-editor-grid">
            <label className="wf-field schedule-field-wide">
              <span>Dienst / Tourbezeichnung</span>
              <input
                {...register("title")}
                aria-invalid={Boolean(errors.title)}
                placeholder="z. B. Frühdienst · Team Nord"
              />
              <FieldError>{errors.title?.message}</FieldError>
            </label>
            <label className="wf-field">
              <span>Team / Standort</span>
              <select {...register("teamId")}>
                <option value="">Kein Team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                    {team.location_name ? ` · ${team.location_name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="wf-field">
              <span>Planungsstatus</span>
              <select {...register("status")} disabled={!canPublish}>
                <option value="draft">Entwurf</option>
                {canPublish ? (
                  <option value="published">Geplant & veröffentlicht</option>
                ) : null}
                {canPublish && shift ? (
                  <option value="changed">
                    Geändert und erneut benachrichtigen
                  </option>
                ) : null}
                {canPublish && shift ? (
                  <option value="cancelled">Abgesagt</option>
                ) : null}
              </select>
              {!canPublish ? (
                <small>
                  Veröffentlichung erfordert eine zusätzliche Berechtigung.
                </small>
              ) : null}
            </label>
            <label className="wf-field">
              <span>Dienstbeginn</span>
              <input
                type="datetime-local"
                {...register("startsAt")}
                aria-invalid={Boolean(errors.startsAt)}
              />
              <FieldError>{errors.startsAt?.message}</FieldError>
            </label>
            <label className="wf-field">
              <span>Dienstende</span>
              <input
                type="datetime-local"
                {...register("endsAt")}
                aria-invalid={Boolean(errors.endsAt)}
              />
              <FieldError>{errors.endsAt?.message}</FieldError>
            </label>
          </div>
          {startsAt && endsAt && new Date(endsAt) > new Date(startsAt) ? (
            <div className="schedule-duration-preview">
              <Clock3 aria-hidden="true" />
              <span>
                Geplante Dauer:{" "}
                <strong>{durationLabel(startsAt, endsAt)}</strong>
              </span>
            </div>
          ) : null}
        </section>
        <fieldset className="schedule-people-fieldset">
          <legend>
            Team besetzen <span>{selectedPeople.length} ausgewählt</span>
          </legend>
          {people.length === 0 ? (
            <p>Keine aktiven Mitarbeitenden verfügbar.</p>
          ) : (
            <>
              <label className="schedule-people-search">
                <Search aria-hidden="true" />
                <span className="wf-sr-only">Mitarbeitende suchen</span>
                <input
                  type="search"
                  value={peopleSearch}
                  onChange={(event) => setPeopleSearch(event.target.value)}
                  placeholder="Mitarbeitende suchen"
                />
              </label>
              {visiblePeople.length > 0 ? (
                <div className="schedule-people-grid">
                  {visiblePeople.map((person) => (
                    <label key={person.id} className="schedule-person-choice">
                      <input
                        type="checkbox"
                        value={person.id}
                        {...register("assigneeIds")}
                      />
                      <span className="avatar">
                        {person.display_name.slice(0, 2).toUpperCase()}
                      </span>
                      <span>{person.display_name}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p>Keine Mitarbeitenden für „{peopleSearch}“ gefunden.</p>
              )}
            </>
          )}
          <FieldError>{errors.assigneeIds?.message}</FieldError>
        </fieldset>
        <MutationNotice kind="error">
          {save.error
            ? humanizeError(
                save.error,
                "Die Schicht konnte nicht gespeichert werden. Bitte prüfen Sie die Angaben.",
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
            disabled={save.isPending || people.length === 0}
          >
            <CalendarCheck size={18} />{" "}
            {save.isPending ? "Wird gespeichert …" : "Schicht speichern"}
          </button>
        </div>
      </form>
    </WorkflowPanel>
  );
}

function ScheduleAgenda({
  shifts,
  me,
  canManage,
  onEdit,
  acknowledge,
}: {
  shifts: Shift[];
  me?: string;
  canManage: boolean;
  onEdit: (shift: Shift) => void;
  acknowledge: ReturnType<typeof useMutation<void, Error, string>>;
}) {
  const days = Array.from(
    new Set(
      shifts.map((shift) => format(new Date(shift.starts_at), "yyyy-MM-dd")),
    ),
  );
  return (
    <div className="schedule-agenda">
      {days.map((day) => {
        const dayShifts = shifts.filter(
          (shift) => format(new Date(shift.starts_at), "yyyy-MM-dd") === day,
        );
        return (
          <section className="schedule-day" key={day}>
            <header>
              <span>
                {isToday(new Date(`${day}T12:00:00`))
                  ? "Heute"
                  : format(new Date(`${day}T12:00:00`), "EEEE", {
                      locale: de,
                    })}
              </span>
              <strong>
                {format(new Date(`${day}T12:00:00`), "dd. MMMM", {
                  locale: de,
                })}
              </strong>
              <small>
                {dayShifts.length}{" "}
                {dayShifts.length === 1 ? "Dienst" : "Dienste"}
              </small>
            </header>
            <div className="schedule-day-shifts">
              {dayShifts.map((shift) => (
                <ShiftCard
                  key={shift.id}
                  shift={shift}
                  me={me}
                  canManage={canManage}
                  onEdit={onEdit}
                  acknowledge={acknowledge}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ScheduleWeek({
  shifts,
  cursor,
  me,
  canManage,
  onEdit,
  acknowledge,
}: {
  shifts: Shift[];
  cursor: Date;
  me?: string;
  canManage: boolean;
  onEdit: (shift: Shift) => void;
  acknowledge: ReturnType<typeof useMutation<void, Error, string>>;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const days = eachDayOfInterval({
    start: startOfWeek(cursor, { weekStartsOn: 1 }),
    end: endOfWeek(cursor, { weekStartsOn: 1 }),
  });

  useEffect(() => {
    const grid = gridRef.current;
    const activeDay = grid?.querySelector<HTMLElement>(
      '[data-active-day="true"]',
    );
    if (!grid || !activeDay) return;
    const centeredPosition =
      activeDay.offsetLeft - (grid.clientWidth - activeDay.offsetWidth) / 2;
    const maximumPosition = grid.scrollWidth - grid.clientWidth;
    grid.scrollTo({
      left: Math.max(0, Math.min(centeredPosition, maximumPosition)),
      behavior: "auto",
    });
  }, [cursor]);

  return (
    <div
      ref={gridRef}
      className="schedule-week"
      role="grid"
      aria-label="Wochenplan"
    >
      {days.map((day) => (
        <ScheduleWeekDay
          key={day.toISOString()}
          day={day}
          selected={isSameDay(day, cursor)}
          shifts={shifts.filter((shift) =>
            isSameDay(new Date(shift.starts_at), day),
          )}
          me={me}
          canManage={canManage}
          onEdit={onEdit}
          acknowledge={acknowledge}
        />
      ))}
    </div>
  );
}

function ScheduleWeekDay({
  day,
  selected,
  shifts,
  me,
  canManage,
  onEdit,
  acknowledge,
}: {
  day: Date;
  selected: boolean;
  shifts: Shift[];
  me?: string;
  canManage: boolean;
  onEdit: (shift: Shift) => void;
  acknowledge: ReturnType<typeof useMutation<void, Error, string>>;
}) {
  return (
    <section
      className={`schedule-week-day ${isToday(day) ? "today" : ""} ${selected ? "selected" : ""}`}
      data-active-day={selected}
      aria-current={isToday(day) ? "date" : undefined}
      aria-label={format(day, "EEEE, dd. MMMM", { locale: de })}
    >
      <header>
        <div>
          <span>{format(day, "EEEE", { locale: de })}</span>
          {isToday(day) ? <small>Heute</small> : null}
        </div>
        <strong>{format(day, "dd")}</strong>
      </header>
      <div className="schedule-week-shifts">
        {shifts.length > 0 ? (
          shifts.map((shift) => (
            <ShiftCard
              key={shift.id}
              shift={shift}
              me={me}
              compact
              canManage={canManage}
              onEdit={onEdit}
              acknowledge={acknowledge}
            />
          ))
        ) : (
          <span className="schedule-week-empty">Kein Dienst</span>
        )}
      </div>
    </section>
  );
}

function ScheduleMonth({
  shifts,
  cursor,
  canManage,
  onEdit,
  onSelectDay,
}: {
  shifts: Shift[];
  cursor: Date;
  canManage: boolean;
  onEdit: (shift: Shift) => void;
  onSelectDay: (day: Date) => void;
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
  });
  const weekdays = eachDayOfInterval({
    start: startOfWeek(cursor, { weekStartsOn: 1 }),
    end: endOfWeek(cursor, { weekStartsOn: 1 }),
  });
  return (
    <div className="schedule-month" role="grid" aria-label="Monatsplan">
      {weekdays.map((day) => (
        <span
          key={day.toISOString()}
          className="schedule-month-weekday"
          role="columnheader"
        >
          {format(day, "EEE", { locale: de })}
        </span>
      ))}
      {days.map((day) => {
        const dayShifts = shifts.filter((shift) =>
          isSameDay(new Date(shift.starts_at), day),
        );
        return (
          <section
            key={day.toISOString()}
            className={`${isSameMonth(day, cursor) ? "" : "outside"} ${isSameDay(day, new Date()) ? "today" : ""}`}
          >
            <button
              type="button"
              className="schedule-month-date"
              aria-label={`${format(day, "EEEE, dd. MMMM", { locale: de })} in der Tagesansicht öffnen`}
              onClick={() => onSelectDay(day)}
            >
              {format(day, "dd")}
            </button>
            {dayShifts.slice(0, 3).map((shift) => (
              <button
                key={shift.id}
                type="button"
                className={`schedule-month-shift status-${shift.status}`}
                onClick={() => (canManage ? onEdit(shift) : onSelectDay(day))}
                aria-label={`${format(new Date(shift.starts_at), "HH:mm")} Uhr, ${shift.title}`}
              >
                <span>{format(new Date(shift.starts_at), "HH:mm")}</span>{" "}
                {shift.title}
              </button>
            ))}
            {dayShifts.length > 3 ? (
              <button
                type="button"
                className="schedule-month-more"
                onClick={() => onSelectDay(day)}
                aria-label={`${dayShifts.length - 3} weitere Dienste am ${format(day, "dd. MMMM", { locale: de })} anzeigen`}
              >
                <span>+{dayShifts.length - 3}</span>{" "}
                <span className="schedule-month-more-label">weitere</span>
              </button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function ShiftCard({
  shift,
  me,
  compact = false,
  canManage,
  onEdit,
  acknowledge,
}: {
  shift: Shift;
  me?: string;
  compact?: boolean;
  canManage: boolean;
  onEdit: (shift: Shift) => void;
  acknowledge: ReturnType<typeof useMutation<void, Error, string>>;
}) {
  const ownAssignment = shift.shift_assignments.find(
    (assignment) => assignment.profile_id === me,
  );
  const mayAcknowledge =
    ownAssignment &&
    !ownAssignment.acknowledged_at &&
    (shift.status === "published" || shift.status === "changed");
  const meta = statusMeta[shift.status];
  const assignedNames = shift.shift_assignments
    .map((assignment) => assignment.profiles?.display_name)
    .filter((name): name is string => Boolean(name));
  const confirmedCount = shift.shift_assignments.filter(
    (assignment) => assignment.acknowledged_at,
  ).length;
  const hasConfirmationState =
    shift.status === "published" || shift.status === "changed";
  const pendingThisShift =
    acknowledge.isPending && acknowledge.variables === shift.id;
  const confirmationText = ownAssignment
    ? ownAssignment.acknowledged_at
      ? "Von Ihnen bestätigt"
      : hasConfirmationState
        ? "Ihre Bestätigung fehlt"
        : "Noch nicht veröffentlicht"
    : hasConfirmationState
      ? `${confirmedCount} von ${shift.shift_assignments.length} bestätigt`
      : "Noch nicht veröffentlicht";
  return (
    <article
      className={`schedule-shift ${compact ? "compact" : ""} status-${shift.status}`}
    >
      <header className="schedule-shift-heading">
        <div className="schedule-shift-time">
          <strong>{format(new Date(shift.starts_at), "HH:mm")}</strong>
          <span>bis {format(new Date(shift.ends_at), "HH:mm")}</span>
        </div>
        <div className="schedule-shift-title">
          <div>
            <h3>{shift.title}</h3>
            <StatusPill label={meta.label} tone={meta.tone} />
          </div>
          {shift.teams ? (
            <span>
              <MapPin /> {shift.teams.name}
              {shift.teams.location_name
                ? ` · ${shift.teams.location_name}`
                : ""}
            </span>
          ) : (
            <span>
              <MapPin /> Kein Standort hinterlegt
            </span>
          )}
        </div>
      </header>
      <div className="schedule-shift-meta">
        <span>
          <Clock3 />
          {durationLabel(shift.starts_at, shift.ends_at)}
        </span>
        <span>
          <Users />
          {shift.shift_assignments.length === 1
            ? (shift.shift_assignments[0].profiles?.display_name ?? "1 Person")
            : `${shift.shift_assignments.length} Personen`}
        </span>
      </div>
      <div className="schedule-roster">
        <div className="schedule-avatar-stack" aria-hidden="true">
          {assignedNames.slice(0, 3).map((name) => (
            <span className="avatar" key={name}>
              {name.slice(0, 2).toUpperCase()}
            </span>
          ))}
          {assignedNames.length > 3 ? (
            <span className="avatar">+{assignedNames.length - 3}</span>
          ) : null}
        </div>
        <div>
          <strong>
            {assignedNames.length > 0
              ? assignedNames.join(", ")
              : "Noch unbesetzt"}
          </strong>
          <span
            className={
              hasConfirmationState &&
              confirmedCount < shift.shift_assignments.length
                ? "pending"
                : ""
            }
          >
            {confirmationText}
          </span>
        </div>
      </div>
      {mayAcknowledge || canManage || ownAssignment?.acknowledged_at ? (
        <div className="wf-card-actions schedule-shift-actions">
          {mayAcknowledge ? (
            <button
              type="button"
              className="wf-secondary"
              onClick={() => acknowledge.mutate(shift.id)}
              disabled={pendingThisShift}
            >
              <Check size={17} />{" "}
              {pendingThisShift ? "Wird bestätigt …" : "Dienst bestätigen"}
            </button>
          ) : null}
          {ownAssignment?.acknowledged_at ? (
            <span className="schedule-acknowledged">
              <Check size={16} /> Bestätigt
            </span>
          ) : null}
          {canManage ? (
            <button
              type="button"
              className="wf-quiet"
              onClick={() => onEdit(shift)}
            >
              <Pencil size={16} /> Bearbeiten
            </button>
          ) : null}
        </div>
      ) : null}
      {acknowledge.error && acknowledge.variables === shift.id ? (
        <span className="schedule-action-error" role="alert">
          Die Bestätigung konnte nicht gespeichert werden. Bitte erneut
          versuchen.
        </span>
      ) : null}
    </article>
  );
}

export function ScheduleAdminPage() {
  return <SchedulePage />;
}
