import { z } from "npm:zod@4.4.3";
import { corsHeaders, json } from "../_shared/http.ts";
import {
  changeEmployeeEmail,
  employeeEditError,
} from "../_shared/employee-edit.ts";
import {
  handlerError,
  HttpError,
  preflight,
  requireUser,
} from "../_shared/security.ts";

const input = z
  .object({ profileId: z.uuid(), email: z.email().max(254) })
  .strict();
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
    const parsed = input.safeParse(await req.json());
    if (!parsed.success)
      throw new HttpError(
        422,
        "invalid_input",
        "Bitte prüfen Sie die E-Mail-Adresse.",
      );
    const email = parsed.data.email.trim().toLowerCase();
    const args = {
      p_profile_id: parsed.data.profileId,
      p_request_id: requestId,
    };
    const { data, error } = await context.caller.rpc(
      "admin_begin_employee_email_change",
      { ...args, p_email: email },
    );
    if (error) throw employeeEditError(error) ?? error;
    const target = Array.isArray(data) ? data[0] : data;
    if (!target?.auth_user_id)
      throw new HttpError(
        404,
        "profile_not_found",
        "Dieser Benutzer ist nicht mehr verfügbar.",
      );
    await changeEmployeeEmail(
      {
        getAuth: async () => {
          const { data, error } = await context.admin.auth.admin.getUserById(
            target.auth_user_id,
          );
          if (error || !data.user?.email)
            throw error ?? new Error("auth_user_not_found");
          return {
            email: data.user.email,
            confirmed: Boolean(data.user.email_confirmed_at),
          };
        },
        updateAuth: async (email, confirmed) => {
          const { error } = await context.admin.auth.admin.updateUserById(
            target.auth_user_id,
            { email, email_confirm: confirmed },
          );
          if (error) throw employeeEditError(error) ?? error;
        },
        invalidateLinks: async (email, confirmed) => {
          const { data, error } = await context.admin.auth.admin.generateLink({
            type: confirmed ? "recovery" : "invite",
            email,
          });
          if (error || data.user?.id !== target.auth_user_id)
            throw error ?? new Error("email_link_invalidation_failed");
          // Deliberately discard the generated link: changing details sends no mail.
        },
        complete: async () => {
          const { error } = await context.caller.rpc(
            "admin_complete_employee_email_change",
            args,
          );
          if (error) throw employeeEditError(error) ?? error;
        },
        readState: async () => {
          const { data, error } = await context.caller.rpc(
            "admin_employee_email_change_state",
            args,
          );
          if (error || typeof data !== "string")
            throw error ?? new Error("email_change_state_unavailable");
          return data;
        },
        cancel: async (restored) => {
          const { error } = await context.caller.rpc(
            "admin_cancel_employee_email_change",
            { ...args, p_auth_restored: restored },
          );
          if (error) throw error;
        },
      },
      email,
    );
    return json(
      { profileId: parsed.data.profileId, email, emailChanged: true },
      200,
      requestId,
      corsHeaders(origin),
    );
  } catch (error) {
    return handlerError(error, requestId, origin);
  }
});
