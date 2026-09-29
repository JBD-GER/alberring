import { z } from "npm:zod@4.4.3";
import { HttpError } from "./security.ts";

const optionalText = (max: number) => z.string().trim().max(max).nullable();
const date = z.iso.date().nullable();
export const employeeInput = z
  .object({
    profileId: z.uuid(),
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    displayName: z.string().trim().min(2).max(120),
    employeeNumber: optionalText(80),
    workPhone: optionalText(40),
    jobTitle: optionalText(120),
    employmentStatus: z.enum(["active", "leave", "inactive", "terminated"]),
    startDate: date,
    endDate: date,
    birthDate: date,
    weeklyHours: z.number().min(0).max(80).nullable(),
  })
  .strict()
  .refine(
    (value) =>
      !value.startDate || !value.endDate || value.endDate >= value.startDate,
    {
      message: "Austritt darf nicht vor Eintritt liegen.",
    },
  );

export function employeeEditError(error: {
  message: string;
  code?: string;
}): HttpError | null {
  if (error.message.includes("permission_denied"))
    return new HttpError(
      403,
      "forbidden",
      "Nur ein Super Admin kann Mitarbeiterdaten ändern.",
    );
  if (error.message.includes("profile_not_found"))
    return new HttpError(
      404,
      "profile_not_found",
      "Dieser Benutzer ist nicht mehr verfügbar.",
    );
  if (error.message.includes("account_operation_in_progress"))
    return new HttpError(
      409,
      "account_operation_in_progress",
      "Für dieses Konto läuft gerade eine Änderung oder ein Einladungsversand. Bitte warten Sie einige Minuten.",
    );
  if (
    error.message.includes("email_not_available") ||
    error.code === "email_exists"
  )
    return new HttpError(
      409,
      "email_not_available",
      "Diese E-Mail-Adresse wird bereits verwendet. Bitte prüfen Sie die Adresse.",
    );
  if (error.message.includes("employee_number"))
    return new HttpError(
      409,
      "employee_number_not_available",
      "Diese Mitarbeiternummer wird bereits verwendet.",
    );
  if (error.code === "23505")
    return new HttpError(
      409,
      "duplicate_employee_data",
      "Die E-Mail-Adresse oder Mitarbeiternummer wird bereits verwendet.",
    );
  if (
    error.message.includes("invalid_employee_fields") ||
    error.message.includes("invalid_email")
  )
    return new HttpError(
      422,
      "invalid_input",
      "Bitte prüfen Sie Namen, E-Mail-Adresse, Datumsangaben und Wochenstunden.",
    );
  return null;
}

export type EmailAuthUser = { email: string; confirmed: boolean };
export type EmailChangeOperations = {
  getAuth: () => Promise<EmailAuthUser>;
  updateAuth: (email: string, confirmed: boolean) => Promise<void>;
  invalidateLinks: (email: string, confirmed: boolean) => Promise<void>;
  complete: () => Promise<void>;
  readState: () => Promise<string>;
  cancel: (restored: boolean) => Promise<void>;
};

// Brackets the supported Auth API with a database reservation. Before any
// compensation, resolve ambiguous RPC failures so a committed operation is
// never accidentally reverted in Auth alone.
export async function changeEmployeeEmail(
  operations: EmailChangeOperations,
  email: string,
) {
  let original: EmailAuthUser | undefined;
  let authMayHaveChanged = false;
  try {
    original = await operations.getAuth();
    if (original.email.toLowerCase() !== email.toLowerCase()) {
      authMayHaveChanged = true;
      await operations.updateAuth(email, original.confirmed);
      // generateLink does not send mail. Rotating its token invalidates earlier
      // invite/recovery links even on Auth versions predating token cleanup.
      await operations.invalidateLinks(email, original.confirmed);
    }
    await operations.complete();
  } catch (error) {
    let state: string;
    try {
      state = await operations.readState();
    } catch {
      throw new HttpError(
        503,
        "email_change_unknown",
        "Der Abschluss der E-Mail-Änderung konnte nicht geprüft werden. Bitte laden Sie die Benutzerliste neu und versuchen Sie es nach einigen Minuten erneut.",
      );
    }
    if (state === "completed") return;
    let restored = !authMayHaveChanged;
    if (authMayHaveChanged && original) {
      try {
        const current = await operations.getAuth();
        if (current.email.toLowerCase() === original.email.toLowerCase())
          restored = true;
        else if (current.email.toLowerCase() === email.toLowerCase()) {
          await operations.updateAuth(original.email, original.confirmed);
          await operations.invalidateLinks(original.email, original.confirmed);
          restored = true;
        }
      } catch {
        restored = false;
      }
    }
    let cancelled = true;
    try {
      await operations.cancel(restored);
    } catch {
      cancelled = false;
    }
    if (!restored)
      throw new HttpError(
        503,
        "email_change_partial_failure",
        "Die Anmeldeadresse konnte nicht sicher mit den Mitarbeiterdaten abgeglichen werden. Bitte speichern Sie die gewünschte E-Mail-Adresse erneut. Falls die Änderung noch gesperrt ist, warten Sie einige Minuten.",
      );
    if (!cancelled)
      throw new HttpError(
        503,
        "email_change_retry_later",
        "Die E-Mail-Änderung wurde zurückgenommen. Bitte warten Sie einige Minuten, bevor Sie es erneut versuchen.",
      );
    throw error;
  }
}
