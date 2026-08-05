import { isAuthWeakPasswordError } from "@supabase/supabase-js";

const weakPasswordMessage =
  "Dieses Passwort erfüllt die Sicherheitsanforderungen nicht oder ist bereits in bekannten Datenlecks aufgetaucht. Bitte wählen Sie ein anderes Passwort.";

export function passwordChangeErrorMessage(
  error: unknown,
  invalidLinkMessage: string,
) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;

  return isAuthWeakPasswordError(error) || code === "weak_password"
    ? weakPasswordMessage
    : invalidLinkMessage;
}
