import { z } from "npm:zod@4.4.3";
import { corsHeaders, json } from "../_shared/http.ts";
import {
  logInvitationFailure,
  sendInvitationEmail,
} from "../_shared/invitations.ts";
import {
  handlerError,
  HttpError,
  preflight,
  requireUser,
} from "../_shared/security.ts";

const input = z.object({ profileId: z.uuid() });

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
      throw new HttpError(422, "invalid_input", "Eingaben sind ungültig.");
    const { data: targets, error: targetError } = await context.caller.rpc(
      "admin_begin_invite_resend",
      {
        p_profile_id: parsed.data.profileId,
        p_request_id: requestId,
      },
    );
    const target = Array.isArray(targets) ? targets[0] : targets;
    if (targetError?.message.includes("account_operation_in_progress"))
      throw new HttpError(
        409,
        "account_operation_in_progress",
        "Die E-Mail-Adresse wird gerade geändert. Bitte warten Sie einige Minuten, bevor Sie die Einladung erneut senden.",
      );
    if (targetError?.message.includes("invite_cooldown"))
      throw new HttpError(
        429,
        "invite_cooldown",
        "Die Einladung wurde gerade bereits versendet. Bitte warten Sie kurz.",
      );
    if (targetError || !target || target.status !== "invited")
      throw new HttpError(
        409,
        "invite_not_available",
        "Für dieses Konto ist keine offene Einladung vorhanden.",
      );
    const appUrl = Deno.env.get("APP_URL");
    if (!appUrl) throw new Error("app_url_missing");
    const redirectTo = `${appUrl.replace(/\/$/, "")}/accept-invite`;
    const { data: authTarget, error: authTargetError } =
      await context.admin.auth.admin.getUserById(target.auth_user_id);
    if (authTargetError || !authTarget.user)
      throw authTargetError ?? new Error("auth_user_not_found");
    if (authTarget.user.email?.toLowerCase() !== target.email.toLowerCase())
      throw new HttpError(
        409,
        "invite_email_mismatch",
        "Die E-Mail-Adresse des Kontos stimmt nicht überein. Bitte korrigieren Sie zuerst die Mitarbeiteradresse.",
      );
    const { error: metadataError } =
      await context.admin.auth.admin.updateUserById(target.auth_user_id, {
        app_metadata: {
          ...authTarget.user.app_metadata,
          organization_id: context.organizationId,
        },
      });
    if (metadataError) throw metadataError;
    const delivery = await sendInvitationEmail(
      context.admin,
      target.email,
      redirectTo,
      Boolean(authTarget.user.email_confirmed_at),
      target.auth_user_id,
    );
    const { manualInviteUrl } = delivery;
    let auditError: unknown = null;
    try {
      const result = await context.admin.from("audit_logs").insert({
        organization_id: context.organizationId,
        actor_id: context.profileId,
        action: "user.invite_resent",
        entity_type: "profile",
        entity_id: parsed.data.profileId,
        request_id: requestId,
        metadata: {
          delivery: delivery.delivery,
        },
      });
      auditError = result.error;
    } catch (error) {
      auditError = error;
    }
    if (auditError) {
      logInvitationFailure(requestId, "invite_sent_audit_failed", auditError);
      return json(
        {
          ...delivery,
          auditRecorded: false,
          warning: {
            code: manualInviteUrl
              ? "manual_link_audit_partial_failure"
              : "audit_partial_failure",
            message: manualInviteUrl
              ? "Ein neuer Einladungslink wurde erstellt, konnte aber nicht protokolliert werden. Geben Sie ihn bitte sicher an die Person weiter."
              : "Die Einladung wurde versendet, der Abschluss konnte aber nicht protokolliert werden.",
          },
        },
        207,
        requestId,
        corsHeaders(origin),
      );
    }
    return json(delivery, 200, requestId, corsHeaders(origin));
  } catch (error) {
    return handlerError(error, requestId, origin);
  }
});
