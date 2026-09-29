import { isAuthWeakPasswordError } from "@supabase/supabase-js";

const weakPasswordMessage =
  "Dieses Passwort erfüllt die Sicherheitsanforderungen nicht oder ist bereits in bekannten Datenlecks aufgetaucht. Bitte wählen Sie ein anderes Passwort.";

function errorProperty(error: unknown, property: string): unknown {
  return typeof error === "object" && error !== null && property in error
    ? (error as Record<string, unknown>)[property]
    : undefined;
}

export function passwordResetRequestErrorMessage(error: unknown) {
  const code = errorProperty(error, "code");
  if (code === "over_email_send_rate_limit")
    return "Das Versandlimit für E-Mails ist vorübergehend erreicht. Bitte warten Sie etwas und versuchen Sie es erneut. Falls der Fehler bestehen bleibt, wenden Sie sich an die Administration.";
  if (
    code === "over_request_rate_limit" ||
    errorProperty(error, "status") === 429
  )
    return "Zu viele Anfragen in kurzer Zeit. Bitte warten Sie einige Minuten und versuchen Sie es erneut.";
  if (
    code === "email_address_not_authorized" ||
    (typeof errorProperty(error, "status") === "number" &&
      Number(errorProperty(error, "status")) >= 500)
  )
    return "Der E-Mail-Versand ist derzeit nicht verfügbar. Bitte wenden Sie sich an die Administration.";
  return "Die Anfrage konnte nicht abgeschlossen werden. Prüfen Sie die Verbindung und versuchen Sie es erneut.";
}

export function passwordChangeErrorMessage(
  error: unknown,
  invalidLinkMessage: string,
) {
  const code = errorProperty(error, "code");

  if (isAuthWeakPasswordError(error) || code === "weak_password")
    return weakPasswordMessage;
  if (code === "same_password")
    return "Bitte wählen Sie ein anderes Passwort als Ihr bisheriges Passwort.";
  if (
    errorProperty(error, "name") === "AuthSessionMissingError" ||
    [
      "otp_expired",
      "invite_not_found",
      "session_expired",
      "session_not_found",
      "refresh_token_not_found",
      "bad_jwt",
    ].includes(String(code))
  )
    return invalidLinkMessage;
  if (
    code === "over_request_rate_limit" ||
    errorProperty(error, "status") === 429
  )
    return "Zu viele Anfragen in kurzer Zeit. Bitte warten Sie einige Minuten und versuchen Sie es erneut.";
  return "Das Passwort konnte nicht gespeichert werden. Prüfen Sie die Verbindung und versuchen Sie es erneut.";
}
