import { corsHeaders, json } from "../_shared/http.ts";
import { employeeEditError, employeeInput } from "../_shared/employee-edit.ts";
import {
  handlerError,
  HttpError,
  preflight,
  requireUser,
} from "../_shared/security.ts";

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const origin = req.headers.get("origin");
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
  try {
    const context = await requireUser(req, "users.manage");
    const parsed = employeeInput.safeParse(await req.json());
    if (!parsed.success)
      throw new HttpError(
        422,
        "invalid_input",
        "Bitte prüfen Sie die Mitarbeiterdaten, Datumsangaben und Wochenstunden.",
      );
    const { profileId, ...fields } = parsed.data;
    const { error } = await context.caller.rpc("admin_update_employee", {
      p_profile_id: profileId,
      p_fields: fields,
      p_request_id: requestId,
    });
    if (error) throw employeeEditError(error) ?? error;
    return json(
      { profileId, saved: true },
      200,
      requestId,
      corsHeaders(origin),
    );
  } catch (error) {
    return handlerError(error, requestId, origin);
  }
});
