import {
  createClient,
  isAuthApiError,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.110.2";
import { corsHeaders, json } from "./http.ts";

export type UserContext = {
  caller: SupabaseClient;
  admin: SupabaseClient;
  userId: string;
  profileId: string;
  organizationId: string;
  permissions: Set<string>;
};

export const clients = (authorization = "") => {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service)
    throw new Error("server_configuration_missing");
  return {
    caller: createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    }),
    admin: createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
};

export async function requireUser(
  req: Request,
  permission?: string,
): Promise<UserContext> {
  const { caller, admin } = clients(req.headers.get("authorization") ?? "");
  const {
    data: { user },
    error: userError,
  } = await caller.auth.getUser();
  if (userError || !user)
    throw new HttpError(401, "unauthorized", "Anmeldung erforderlich.");
  const [
    { data: profiles, error: profileError },
    { data: permissionRows, error: permissionsError },
  ] = await Promise.all([
    caller.rpc("get_my_profile"),
    caller.rpc("my_permissions"),
  ]);
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  if (profileError || !profile || profile.status !== "active")
    throw new HttpError(403, "account_inactive", "Das Konto ist nicht aktiv.");
  if (permissionsError)
    throw new HttpError(
      403,
      "permissions_unavailable",
      "Berechtigungen konnten nicht geprüft werden.",
    );
  const permissions = new Set<string>(
    (permissionRows ?? []).map((row: { permission_key: string }) =>
      String(row.permission_key),
    ),
  );
  if (permission && !permissions.has(permission))
    throw new HttpError(403, "forbidden", "Berechtigung fehlt.");
  return {
    caller,
    admin,
    userId: user.id,
    profileId: profile.id,
    organizationId: profile.organization_id,
    permissions,
  };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const manualEmailLinkErrorCodes = new Set([
  "email_address_not_authorized",
  "email_provider_disabled",
]);

export const shouldUseManualEmailLink = (error: unknown) =>
  isAuthApiError(error) && manualEmailLinkErrorCodes.has(error.code ?? "");

export const handlerError = (
  error: unknown,
  requestId: string,
  origin: string | null,
) => {
  if (error instanceof HttpError)
    return json(
      { error: { code: error.code, message: error.message } },
      error.status,
      requestId,
      corsHeaders(origin),
    );
  if (isAuthApiError(error)) {
    if (
      error.code === "email_address_not_authorized" ||
      error.code === "email_provider_disabled"
    ) {
      return json(
        {
          error: {
            code: "email_delivery_unavailable",
            message:
              "Der E-Mail-Versand ist noch nicht für Mitarbeiteradressen eingerichtet. Bitte konfigurieren Sie den SMTP-Versand in Supabase.",
          },
        },
        503,
        requestId,
        corsHeaders(origin),
      );
    }
    if (error.code === "over_email_send_rate_limit") {
      return json(
        {
          error: {
            code: "email_rate_limit",
            message:
              "Das Versandlimit wurde erreicht. Bitte versuchen Sie es später erneut.",
          },
        },
        429,
        requestId,
        corsHeaders(origin),
      );
    }
  }
  console.error(
    JSON.stringify({
      requestId,
      event: "edge_function_failed",
      errorCode: isAuthApiError(error)
        ? error.code
        : error instanceof Error
          ? error.message
          : "unknown",
    }),
  );
  return json(
    {
      error: {
        code: "internal_error",
        message: "Die Aktion konnte nicht ausgeführt werden.",
      },
    },
    500,
    requestId,
    corsHeaders(origin),
  );
};

export const preflight = (req: Request) =>
  req.method === "OPTIONS"
    ? new Response(null, {
        status: 204,
        headers: corsHeaders(req.headers.get("origin")),
      })
    : null;

export function requireAutomation(req: Request) {
  const expected = Deno.env.get("AUTOMATION_SECRET");
  const received =
    req.headers.get("x-automation-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !received || expected.length !== received.length)
    throw new HttpError(
      401,
      "unauthorized",
      "Automatisierungszugriff verweigert.",
    );
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1)
    mismatch |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  if (mismatch !== 0)
    throw new HttpError(
      401,
      "unauthorized",
      "Automatisierungszugriff verweigert.",
    );
  return clients().admin;
}

export const localDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>(
      (all, part) => ({ ...all, [part.type]: part.value }),
      {},
    );
  return {
    iso: `${parts.year}-${parts.month}-${parts.day}`,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
};
