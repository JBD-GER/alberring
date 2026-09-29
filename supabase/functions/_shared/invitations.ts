import {
  isAuthApiError,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.110.2";
import {
  HttpError,
  shouldUseManualEmailLink,
  type UserContext,
} from "./security.ts";

export type InvitationDelivery = {
  sent: boolean;
  delivery: "email" | "manual_link" | "failed";
  manualInviteUrl: string | null;
  warning?: { code: string; message: string };
};

export const logInvitationFailure = (
  requestId: string,
  event: string,
  error: unknown,
) => {
  // Provider errors may contain recipient addresses. Never log the full error
  // or a generated authentication link.
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "unknown";
  console.error(
    JSON.stringify({
      requestId,
      event,
      errorCode: /^[a-z0-9_.:-]{1,80}$/i.test(code) ? code : "unknown",
    }),
  );
};

export async function sendInvitationEmail(
  admin: SupabaseClient,
  email: string,
  redirectTo: string,
  confirmed: boolean,
  authUserId: string,
): Promise<InvitationDelivery> {
  // An opened invitation can confirm Auth before the employee finishes the
  // password/profile step. Auth rejects another invite for that user; recovery
  // creates the session needed to finish /accept-invite.
  const type = confirmed ? "recovery" : "invite";
  let error: unknown;
  if (confirmed) {
    const result = await admin.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    error = result.error;
  } else {
    const result = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });
    error = result.error;
    if (!error && result.data.user?.id !== authUserId)
      throw new Error("invite_identity_mismatch");
  }
  if (!error) return { sent: true, delivery: "email", manualInviteUrl: null };
  if (!shouldUseManualEmailLink(error)) throw error;

  const { data, error: linkError } = await admin.auth.admin.generateLink({
    type,
    email,
    options: { redirectTo },
  });
  if (linkError || !data.properties?.action_link)
    throw linkError ?? new Error("invite_link_missing");
  if (data.user?.id !== authUserId) throw new Error("invite_identity_mismatch");
  return {
    sent: false,
    delivery: "manual_link",
    manualInviteUrl: data.properties.action_link,
    warning: {
      code: "manual_invite_link",
      message:
        "Es wurde keine E-Mail versendet. Der automatische E-Mail-Versand ist nicht verfügbar. Geben Sie den einmaligen Einladungslink bitte sicher an die Person weiter.",
    },
  };
}

const pendingInvitation = () =>
  new HttpError(
    409,
    "invite_already_pending",
    "Für diese E-Mail besteht bereits eine offene Einladung. Bitte verwenden Sie „Einladung erneut senden“ in der Benutzerliste.",
  );
const existingAccount = () =>
  new HttpError(
    409,
    "user_exists",
    "Für diese E-Mail besteht bereits ein Konto.",
  );

export async function createInvitation(
  context: UserContext,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    roleId: string;
    teamId?: string | null;
  },
  redirectTo: string,
  requestId: string,
): Promise<InvitationDelivery & { profileId: string }> {
  const email = input.email.trim().toLowerCase();
  const lookup = async () => {
    const { data, error } = await context.caller.rpc(
      "admin_lookup_invite_email",
      { p_email: email },
    );
    if (error) {
      if (error.message.includes("email_not_available"))
        throw existingAccount();
      throw error;
    }
    const target = Array.isArray(data) ? data[0] : data;
    if (target?.profile_id)
      throw target.profile_status === "invited"
        ? pendingInvitation()
        : existingAccount();
    if (target && !target.reusable_unconfirmed_auth) throw existingAccount();
    return target;
  };
  let existing = await lookup();
  let authUserId = existing?.auth_user_id;
  if (!authUserId) {
    // Provision without sending mail. The organization is attached atomically,
    // so an interrupted profile transaction can safely be retried via lookup.
    const { data, error } = await context.admin.auth.admin.createUser({
      email,
      email_confirm: false,
      app_metadata: { organization_id: context.organizationId },
    });
    if (error) {
      if (
        !isAuthApiError(error) ||
        !["email_exists", "user_already_exists"].includes(error.code ?? "")
      )
        throw error;
      existing = await lookup();
      authUserId = existing?.auth_user_id;
      if (!authUserId) throw existingAccount();
    } else {
      authUserId = data.user?.id;
    }
  }
  if (!authUserId) throw new Error("invite_user_missing");

  // Never send an invitation until its profile, role and team have committed.
  // On failure retain the unconfirmed, organization-owned Auth record: retries
  // reuse it and cannot delete an account concurrently completed elsewhere.
  const { data: profileId, error: profileError } = await context.caller.rpc(
    "admin_create_invited_profile",
    {
      p_auth_user_id: authUserId,
      p_email: email,
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_role_id: input.roleId,
      p_team_id: input.teamId ?? null,
    },
  );
  if (profileError || !profileId)
    throw profileError ?? new Error("invite_profile_missing");

  try {
    // Use the same reservation as resend so email correction/deletion cannot
    // change the recipient while the first invitation is being delivered.
    const { data: targets, error: reservationError } = await context.caller.rpc(
      "admin_begin_invite_resend",
      { p_profile_id: profileId, p_request_id: requestId },
    );
    const target = Array.isArray(targets) ? targets[0] : targets;
    if (reservationError) throw reservationError;
    if (
      target?.auth_user_id !== authUserId ||
      target.email?.toLowerCase() !== email ||
      target.status !== "invited"
    )
      throw new Error("invite_target_changed");
    const { data, error } =
      await context.admin.auth.admin.getUserById(authUserId);
    if (error || !data.user) throw error ?? new Error("invite_user_missing");
    if (data.user.email?.toLowerCase() !== email)
      throw new Error("invite_email_mismatch");
    const delivery = await sendInvitationEmail(
      context.admin,
      email,
      redirectTo,
      Boolean(data.user.email_confirmed_at),
      authUserId,
    );
    // Complete the reservation after successful email/manual delivery. Keep
    // the existing completion action so email correction/deletion understands
    // it; metadata distinguishes the first send from an explicit resend.
    try {
      const { error: auditError } = await context.admin
        .from("audit_logs")
        .insert({
          organization_id: context.organizationId,
          actor_id: context.profileId,
          action: "user.invite_resent",
          entity_type: "profile",
          entity_id: profileId,
          request_id: requestId,
          metadata: { delivery: delivery.delivery, initial: true },
        });
      if (auditError)
        logInvitationFailure(requestId, "invite_sent_audit_failed", auditError);
    } catch (auditError) {
      logInvitationFailure(requestId, "invite_sent_audit_failed", auditError);
    }
    return { profileId, ...delivery };
  } catch (error) {
    logInvitationFailure(requestId, "invite_delivery_failed", error);
    return {
      profileId,
      sent: false,
      delivery: "failed",
      manualInviteUrl: null,
      warning: {
        code: "invite_delivery_failed",
        message:
          "Der Mitarbeiter wurde angelegt, aber die Einladungs-E-Mail konnte nicht versendet werden. Bitte verwenden Sie „Einladung erneut senden“ beim Mitarbeiter. Bei weiteren Fehlern prüfen Sie den E-Mail-Versand in Supabase.",
      },
    };
  }
}
