import { corsHeaders, json } from "../_shared/http.ts";
import {
  finishJob,
  insertNotifications,
  permissionRecipients,
  startJob,
} from "../_shared/jobs.ts";
import {
  handlerError,
  localDateParts,
  preflight,
  requireAutomation,
} from "../_shared/security.ts";

const monthStart = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}-01`;

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID(),
    origin = req.headers.get("origin");
  const options = preflight(req);
  if (options) return options;
  if (req.method !== "POST")
    return json(
      {
        error: {
          code: "method_not_allowed",
          message: "Methode nicht erlaubt.",
        },
      },
      405,
      requestId,
      corsHeaders(origin),
    );
  let jobId: string | null = null;
  try {
    const admin = requireAutomation(req),
      today = localDateParts();
    jobId = await startJob(admin, "mileage_reminders", today.iso);
    if (!jobId)
      return json(
        { processed: 0, duplicate: true },
        200,
        requestId,
        corsHeaders(origin),
      );
    const lastDay = new Date(Date.UTC(today.year, today.month, 0)).getUTCDate();
    const { data: settings, error: settingsError } = await admin
      .from("organization_settings")
      .select("organization_id,mileage_reminder_days,mileage_overdue_day");
    if (settingsError) throw settingsError;
    let processed = 0;
    for (const setting of settings ?? []) {
      const overdue = today.day === setting.mileage_overdue_day;
      const reminder =
        (setting.mileage_reminder_days ?? [25]).includes(today.day) ||
        today.day === lastDay;
      if (!overdue && !reminder) continue;
      let targetYear = today.year,
        targetMonth = today.month;
      if (overdue) {
        targetMonth -= 1;
        if (targetMonth === 0) {
          targetMonth = 12;
          targetYear -= 1;
        }
      }
      const reportingMonth = monthStart(targetYear, targetMonth);
      const targetMonthLastDay = new Date(
        Date.UTC(targetYear, targetMonth, 0),
      ).getUTCDate();
      const responsibilityDate = overdue
        ? `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetMonthLastDay).padStart(2, "0")}`
        : today.iso;
      const { data: assignments, error: assignmentsError } = await admin
        .from("vehicle_assignments")
        .select("vehicle_id,profile_id,vehicles!inner(status)")
        .eq("organization_id", setting.organization_id)
        .eq("primary_assignment", true)
        .eq("vehicles.status", "active")
        .lte("valid_from", responsibilityDate)
        .or(`valid_until.is.null,valid_until.gte.${responsibilityDate}`);
      if (assignmentsError) throw assignmentsError;
      const vehicleIds = (assignments ?? []).map(
        (row: { vehicle_id: string }) => row.vehicle_id,
      );
      const { data: submissions, error: submissionsError } = vehicleIds.length
        ? await admin
            .from("mileage_submissions")
            .select("vehicle_id")
            .eq("organization_id", setting.organization_id)
            .eq("reporting_month", reportingMonth)
            .neq("status", "rejected")
            .in("vehicle_id", vehicleIds)
        : { data: [], error: null };
      if (submissionsError) throw submissionsError;
      const submitted = new Set(
        (submissions ?? []).map(
          (row: { vehicle_id: string }) => row.vehicle_id,
        ),
      );
      const missing = (assignments ?? []).filter(
        (row: { vehicle_id: string }) => !submitted.has(row.vehicle_id),
      );
      const rows = missing.map(
        (assignment: { profile_id: string; vehicle_id: string }) => ({
          organization_id: setting.organization_id,
          profile_id: assignment.profile_id,
          type: overdue ? "mileage_overdue" : "mileage_due",
          title: overdue
            ? "Kilometerstand überfällig"
            : "Kilometerstand fällig",
          body: overdue
            ? "Bitte reichen Sie den fehlenden Kilometerstand nach."
            : "Bitte melden Sie den aktuellen Kilometerstand Ihres Fahrzeugs.",
          target_path: "/app/fleet",
          deduplication_key: `mileage:${overdue ? "overdue" : "due"}:${assignment.vehicle_id}:${reportingMonth}`,
        }),
      );
      processed += await insertNotifications(admin, rows);
      if (overdue && missing.length) {
        const fleetRecipients = await permissionRecipients(
          admin,
          setting.organization_id,
          "mileage.manage",
        );
        processed += await insertNotifications(
          admin,
          fleetRecipients.map((profileId) => ({
            organization_id: setting.organization_id,
            profile_id: profileId,
            type: "mileage_escalation",
            title: "Fehlende Kilometerstände",
            body: `${missing.length} Kilometerstandsmeldung(en) sind noch offen.`,
            target_path: "/app/admin/fleet",
            deduplication_key: `mileage-escalation:${reportingMonth}:${profileId}`,
          })),
        );
      }
    }
    await finishJob(admin, jobId, processed);
    return json({ processed }, 200, requestId, corsHeaders(origin));
  } catch (error) {
    try {
      if (jobId)
        await finishJob(requireAutomation(req), jobId, 0, "job_failed");
    } catch {
      /* best effort */
    }
    return handlerError(error, requestId, origin);
  }
});
