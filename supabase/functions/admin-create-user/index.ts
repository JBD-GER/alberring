import { z } from "npm:zod@4.4.3";
import { corsHeaders, json } from "../_shared/http.ts";
import {
  handlerError,
  HttpError,
  preflight,
  requireUser,
  shouldUseManualEmailLink,
} from "../_shared/security.ts";

const input = z.object({
  email: z.email(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  roleId: z.uuid(),
  teamId: z.uuid().optional().nullable(),
});

const logCompensationFailure = (
  requestId: string,
  event: string,
  error: unknown,
) => {
  const candidate =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "unknown";
  const errorCode = /^[a-z0-9_.:-]{1,80}$/i.test(candidate)
    ? candidate
    : "unknown";
  console.error(JSON.stringify({ requestId, event, errorCode }));
};

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
  let invitedUserId: string | null = null;
  let createdAuthUser = false;
  let context: Awaited<ReturnType<typeof requireUser>> | null = null;
  try {
    context = await requireUser(req, "users.manage");
    const parsed = input.safeParse(await req.json());
    if (!parsed.success)
      throw new HttpError(422, "invalid_input", "Eingaben sind ungültig.");
    const appUrl = Deno.env.get("APP_URL");
    if (!appUrl) throw new Error("app_url_missing");
    const redirectTo = `${appUrl.replace(/\/$/, "")}/accept-invite`;
    const email = parsed.data.email.trim().toLowerCase();
    const lookupInvite = async () => {
      const { data, error } = await context!.caller.rpc(
        "admin_lookup_invite_email",
        { p_email: email },
      );
      if (error) {
        if (error.message.includes("email_not_available"))
          throw new HttpError(
            409,
            "user_exists",
            "Für diese E-Mail besteht bereits ein Konto.",
          );
        throw error;
      }
      return Array.isArray(data) ? data[0] : data;
    };
    let existing = await lookupInvite();
    if (existing?.profile_id) {
      if (existing.profile_status === "invited") {
        throw new HttpError(
          409,
          "invite_already_pending",
          "Für diese E-Mail besteht bereits eine offene Einladung. Bitte verwenden Sie „Einladung erneut senden“ in der Benutzerliste.",
        );
      }
      throw new HttpError(
        409,
        "user_exists",
        "Für diese E-Mail besteht bereits ein Konto.",
      );
    }
    const { data: invite, error: inviteError } =
      await context.admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
      });
    let inviteUser = invite.user;
    let manualInviteUrl: string | null = null;
    if (inviteError || !invite.user) {
      const existingAccountError = Boolean(
        inviteError?.message.toLowerCase().match(/already|exist|registered/),
      );
      if (inviteError && shouldUseManualEmailLink(inviteError)) {
        const { data: generated, error: generateError } =
          await context.admin.auth.admin.generateLink({
            type: "invite",
            email,
            options: { redirectTo },
          });
        if (
          generateError ||
          !generated.user ||
          !generated.properties?.action_link
        )
          throw generateError ?? new Error("invite_link_missing");
        inviteUser = generated.user;
        manualInviteUrl = generated.properties.action_link;
      } else if (existing?.reusable_unconfirmed_auth && existingAccountError) {
        // The original native invite remains valid; finish the missing profile
        // transaction and let the explicit resend action issue a fresh link.
      } else if (!existing && existingAccountError) {
        // A concurrent/previous request may have created the Auth invite but
        // timed out before the transactional profile creation.
        existing = await lookupInvite();
        if (existing?.profile_id && existing.profile_status === "invited") {
          throw new HttpError(
            409,
            "invite_already_pending",
            "Für diese E-Mail besteht bereits eine offene Einladung. Bitte verwenden Sie „Einladung erneut senden“ in der Benutzerliste.",
          );
        }
        if (!existing?.reusable_unconfirmed_auth)
          throw new HttpError(
            409,
            "user_exists",
            "Für diese E-Mail besteht bereits ein Konto.",
          );
      } else {
        throw inviteError ?? new Error("invite_failed");
      }
    }
    invitedUserId = inviteUser?.id ?? existing?.auth_user_id ?? null;
    if (!invitedUserId) throw new Error("invite_user_missing");
    createdAuthUser = !existing && Boolean(inviteUser);
    let invitedAppMetadata = inviteUser?.app_metadata;
    if (!invitedAppMetadata) {
      const { data: authTarget, error: authTargetError } =
        await context.admin.auth.admin.getUserById(invitedUserId);
      if (authTargetError || !authTarget.user)
        throw authTargetError ?? new Error("invite_user_missing");
      invitedAppMetadata = authTarget.user.app_metadata;
    }
    const { error: metadataError } =
      await context.admin.auth.admin.updateUserById(invitedUserId, {
        app_metadata: {
          ...invitedAppMetadata,
          organization_id: context.organizationId,
        },
      });
    if (metadataError) throw metadataError;
    const { data: profileId, error: profileError } = await context.caller.rpc(
      "admin_create_invited_profile",
      {
        p_auth_user_id: invitedUserId,
        p_email: email,
        p_first_name: parsed.data.firstName,
        p_last_name: parsed.data.lastName,
        p_role_id: parsed.data.roleId,
        p_team_id: parsed.data.teamId ?? null,
      },
    );
    if (profileError) throw profileError;
    return json(
      {
        profileId,
        delivery: manualInviteUrl ? "manual_link" : "email",
        manualInviteUrl,
        warning: manualInviteUrl
          ? {
              code: "manual_invite_link",
              message:
                "Der Mitarbeiter wurde angelegt. Weil der automatische E-Mail-Versand nicht verfügbar ist, geben Sie den einmaligen Einladungslink bitte sicher an die Person weiter.",
            }
          : undefined,
      },
      201,
      requestId,
      corsHeaders(origin),
    );
  } catch (error) {
    if (createdAuthUser && invitedUserId && context) {
      try {
        const { error: compensationError } =
          await context.admin.auth.admin.deleteUser(invitedUserId);
        if (compensationError)
          logCompensationFailure(
            requestId,
            "invite_auth_compensation_failed",
            compensationError,
          );
      } catch (compensationError) {
        logCompensationFailure(
          requestId,
          "invite_auth_compensation_failed",
          compensationError,
        );
      }
    }
    return handlerError(error, requestId, origin);
  }
});
