import { HttpError } from "./security.ts";

export function userDeletionError(error: {
  message: string;
}): HttpError | null {
  if (error.message.includes("cannot_delete_own_account"))
    return new HttpError(
      403,
      "own_account",
      "Das eigene Konto kann nicht gelöscht werden. Ein anderer Super Admin muss dies durchführen.",
    );
  if (error.message.includes("last_super_admin_cannot_be_deleted"))
    return new HttpError(
      409,
      "last_super_admin",
      "Mindestens ein aktiver Super Admin muss erhalten bleiben.",
    );
  if (error.message.includes("account_operation_in_progress"))
    return new HttpError(
      409,
      "account_operation_in_progress",
      "Für dieses Konto läuft gerade eine Einladungs- oder E-Mail-Änderung. Bitte warten Sie kurz und versuchen Sie es erneut.",
    );
  if (error.message.includes("profile_not_found"))
    return new HttpError(
      404,
      "profile_not_found",
      "Der Benutzer wurde nicht gefunden.",
    );
  if (error.message.includes("permission_denied"))
    return new HttpError(
      403,
      "forbidden",
      "Nur ein Super Admin kann Benutzer löschen.",
    );
  return null;
}
