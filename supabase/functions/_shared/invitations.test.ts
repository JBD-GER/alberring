import { createClient } from "npm:@supabase/supabase-js@2.110.2";
import { createInvitation, sendInvitationEmail } from "./invitations.ts";
import { HttpError, type UserContext } from "./security.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
};
const assertRejects = async (
  operation: () => Promise<unknown>,
  message: string,
) => {
  try {
    await operation();
  } catch (error) {
    assertEquals(
      error instanceof Error
        ? error.message
        : (error as { message: string }).message,
      message,
    );
    return;
  }
  throw new Error("Expected rejection");
};
const authId = "a1000000-0000-4000-8000-000000000001";
const profileId = "a2000000-0000-4000-8000-000000000001";
const email = "employee@example.test";
const redirectTo = "https://app.example.test/accept-invite";
const manualLink = "https://auth.example.test/verify?token=example";
const input = {
  email: " Employee@Example.test ",
  firstName: "Test",
  lastName: "Employee",
  roleId: "a3000000-0000-4000-8000-000000000001",
};

type Options = {
  confirmed?: boolean;
  existing?: "orphan" | "pending" | "other_org";
  duplicateCreate?: boolean;
  profileFailure?: boolean;
  mailError?: string;
  linkError?: boolean;
  linkUserId?: string;
  authEmail?: string;
};
function fixture(options: Options = {}) {
  const calls: {
    path: string;
    method: string;
    body: Record<string, unknown>;
    redirect: string | null;
  }[] = [];
  let lookups = 0;
  const user = {
    id: authId,
    email: options.authEmail ?? email,
    email_confirmed_at: options.confirmed ? "2026-09-01T00:00:00Z" : undefined,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-09-01T00:00:00Z",
  };
  const reply = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        "X-Supabase-Api-Version": "2024-01-01",
      },
    });
  const admin = createClient("https://auth.example.test", "test-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, init) => {
        const request = new Request(
          url as RequestInfo | URL,
          init as RequestInit,
        );
        const requestUrl = new URL(request.url);
        const path = requestUrl.pathname;
        const method = request.method;
        const bodyText = await request.text();
        const body = bodyText ? JSON.parse(bodyText) : {};
        calls.push({
          path,
          method,
          body,
          redirect: requestUrl.searchParams.get("redirect_to"),
        });
        if (path.endsWith("admin_lookup_invite_email")) {
          lookups++;
          if (options.existing === "other_org")
            return reply(
              { code: "23505", message: "email_not_available" },
              409,
            );
          if (options.existing || (options.duplicateCreate && lookups > 1))
            return reply([
              {
                auth_user_id: authId,
                profile_id: options.existing === "pending" ? profileId : null,
                profile_status: "invited",
                reusable_unconfirmed_auth: options.existing !== "pending",
              },
            ]);
          return reply([]);
        }
        if (path.endsWith("admin_create_invited_profile"))
          return options.profileFailure
            ? reply({ code: "22023", message: "role_not_available" }, 400)
            : reply(profileId);
        if (path.endsWith("admin_begin_invite_resend"))
          return reply([{ auth_user_id: authId, email, status: "invited" }]);
        if (path.endsWith("/audit_logs")) return reply({});
        if (path.endsWith("/admin/users") && method === "POST")
          return options.duplicateCreate
            ? reply({ code: "email_exists", msg: "User already exists" }, 422)
            : reply(user);
        if (path.endsWith(`/admin/users/${authId}`)) return reply(user);
        if (path.endsWith("/invite") || path.endsWith("/recover"))
          return options.mailError
            ? reply(
                { code: options.mailError, msg: "Mail failed" },
                options.mailError === "over_email_send_rate_limit" ? 429 : 403,
              )
            : reply(path.endsWith("/invite") ? user : {});
        if (path.endsWith("/admin/generate_link"))
          return options.linkError
            ? reply({ code: "unexpected_failure", msg: "Link failed" }, 422)
            : reply({
                ...user,
                id: options.linkUserId ?? authId,
                action_link: manualLink,
                email_otp: "123456",
                hashed_token: "hash",
                redirect_to: redirectTo,
                verification_type: body.type,
              });
        throw new Error(`Unexpected request ${method} ${path}`);
      },
    },
  });
  const context: UserContext = {
    admin,
    caller: admin,
    userId: "caller-auth",
    profileId: "caller-profile",
    organizationId: "organization",
    permissions: new Set(["users.manage"]),
  };
  return { admin, context, calls };
}

Deno.test(
  "unconfirmed invitations use invite and the acceptance redirect",
  async () => {
    const { admin, calls } = fixture();
    const result = await sendInvitationEmail(
      admin,
      email,
      redirectTo,
      false,
      authId,
    );
    assertEquals(result, {
      sent: true,
      delivery: "email",
      manualInviteUrl: null,
    });
    assertEquals(
      calls.map((c) => c.path),
      ["/auth/v1/invite"],
    );
    assertEquals(calls[0].redirect, redirectTo);
  },
);

Deno.test(
  "confirmed Auth with pending profile uses recovery to finish acceptance",
  async () => {
    const { admin, calls } = fixture({ confirmed: true });
    await sendInvitationEmail(admin, email, redirectTo, true, authId);
    assertEquals(
      calls.map((c) => c.path),
      ["/auth/v1/recover"],
    );
    assertEquals(calls[0].redirect, redirectTo);
  },
);

Deno.test(
  "provider restrictions return an explicitly unsent manual invitation",
  async () => {
    for (const confirmed of [false, true]) {
      const { admin, calls } = fixture({
        mailError: "email_address_not_authorized",
        confirmed,
      });
      const result = await sendInvitationEmail(
        admin,
        email,
        redirectTo,
        confirmed,
        authId,
      );
      assertEquals(result.sent, false);
      assertEquals(result.delivery, "manual_link");
      assertEquals(result.manualInviteUrl, manualLink);
      assertEquals(calls[1].body.type, confirmed ? "recovery" : "invite");
    }
  },
);

Deno.test(
  "rate limited resend keeps the previous emailed token instead of rotating a manual link",
  async () => {
    const { admin, calls } = fixture({
      mailError: "over_email_send_rate_limit",
    });
    await assertRejects(
      () => sendInvitationEmail(admin, email, redirectTo, false, authId),
      "Mail failed",
    );
    assertEquals(calls.length, 1);
  },
);

Deno.test("failed manual link generation never reports success", async () => {
  const { admin } = fixture({
    mailError: "email_provider_disabled",
    linkError: true,
  });
  await assertRejects(
    () => sendInvitationEmail(admin, email, redirectTo, false, authId),
    "Link failed",
  );
});

Deno.test("generated links must belong to the invited Auth user", async () => {
  const { admin } = fixture({
    mailError: "email_provider_disabled",
    linkUserId: "someone-else",
  });
  await assertRejects(
    () => sendInvitationEmail(admin, email, redirectTo, false, authId),
    "invite_identity_mismatch",
  );
});

Deno.test(
  "new invitations save organization metadata and commit the profile before reserving and sending mail",
  async () => {
    const { context, calls } = fixture();
    const result = await createInvitation(
      context,
      input,
      redirectTo,
      "request-id",
    );
    assertEquals(result.delivery, "email");
    assertEquals(result.profileId, profileId);
    assertEquals(
      calls.map((c) => c.path),
      [
        "/rest/v1/rpc/admin_lookup_invite_email",
        "/auth/v1/admin/users",
        "/rest/v1/rpc/admin_create_invited_profile",
        "/rest/v1/rpc/admin_begin_invite_resend",
        `/auth/v1/admin/users/${authId}`,
        "/auth/v1/invite",
        "/rest/v1/audit_logs",
      ],
    );
    assertEquals(calls[1].body.email, email);
    assertEquals(calls[1].body.email_confirm, false);
    assertEquals(calls[1].body.app_metadata, {
      organization_id: "organization",
    });
  },
);

Deno.test(
  "interrupted provisioning reuses its owned unconfirmed Auth user and actually sends mail",
  async () => {
    const { context, calls } = fixture({ existing: "orphan" });
    const result = await createInvitation(
      context,
      input,
      redirectTo,
      "request-id",
    );
    assertEquals(result.sent, true);
    assertEquals(
      calls.some((c) => c.path === "/auth/v1/admin/users"),
      false,
    );
    assertEquals(
      calls.some((c) => c.path.endsWith("/invite")),
      true,
    );
  },
);

Deno.test(
  "a concurrent Auth creation is resolved by the organization-authorized lookup",
  async () => {
    const { context, calls } = fixture({ duplicateCreate: true });
    const result = await createInvitation(
      context,
      input,
      redirectTo,
      "request-id",
    );
    assertEquals(result.sent, true);
    assertEquals(
      calls.filter((c) => c.path.endsWith("admin_lookup_invite_email")).length,
      2,
    );
  },
);

Deno.test("existing pending accounts require explicit resend", async () => {
  const { context, calls } = fixture({ existing: "pending" });
  try {
    await createInvitation(context, input, redirectTo, "request-id");
    throw new Error("Expected pending invitation rejection");
  } catch (error) {
    assertEquals(
      error instanceof HttpError && error.code,
      "invite_already_pending",
    );
  }
  assertEquals(calls.length, 1);
});

Deno.test(
  "accounts belonging to other organizations are never adopted",
  async () => {
    const { context, calls } = fixture({ existing: "other_org" });
    try {
      await createInvitation(context, input, redirectTo, "request-id");
      throw new Error("Expected account rejection");
    } catch (error) {
      assertEquals(error instanceof HttpError && error.code, "user_exists");
    }
    assertEquals(calls.length, 1);
  },
);

Deno.test(
  "profile transaction failures send no mail and retain the retryable Auth record",
  async () => {
    const { context, calls } = fixture({ profileFailure: true });
    await assertRejects(
      () => createInvitation(context, input, redirectTo, "request-id"),
      "role_not_available",
    );
    assertEquals(
      calls.some((c) => c.path.endsWith("/invite")),
      false,
    );
    assertEquals(
      calls.some((c) => c.method === "DELETE"),
      false,
    );
  },
);

Deno.test(
  "delivery failure after saving keeps the profile and never claims email success",
  async () => {
    const { context, calls } = fixture({
      mailError: "over_email_send_rate_limit",
    });
    const result = await createInvitation(
      context,
      input,
      redirectTo,
      "request-id",
    );
    assertEquals(result.profileId, profileId);
    assertEquals(result.sent, false);
    assertEquals(result.delivery, "failed");
    assertEquals(result.manualInviteUrl, null);
    assertEquals(
      calls.some((c) => c.path.endsWith("/admin/generate_link")),
      false,
    );
    assertEquals(
      calls.some((c) => c.method === "DELETE"),
      false,
    );
  },
);

Deno.test(
  "mismatched profile/Auth recipients fail before an invitation is sent",
  async () => {
    const { context, calls } = fixture({ authEmail: "wrong@example.test" });
    const result = await createInvitation(
      context,
      input,
      redirectTo,
      "request-id",
    );
    assertEquals(result.delivery, "failed");
    assertEquals(
      calls.some(
        (c) => c.path.endsWith("/invite") || c.path.endsWith("/recover"),
      ),
      false,
    );
  },
);

Deno.test(
  "an audit transport exception after sending never changes successful delivery to failure",
  async () => {
    const { context, calls } = fixture();
    context.admin.from = (() => {
      throw new Error("audit_connection_failed");
    }) as typeof context.admin.from;
    const result = await createInvitation(
      context,
      input,
      redirectTo,
      "request-id",
    );
    assertEquals(result.sent, true);
    assertEquals(result.delivery, "email");
    assertEquals(calls.filter((c) => c.path.endsWith("/invite")).length, 1);
  },
);

Deno.test(
  "the initial provider restriction returns a saved profile and a clearly unsent manual link",
  async () => {
    const { context } = fixture({ mailError: "email_address_not_authorized" });
    const result = await createInvitation(
      context,
      input,
      redirectTo,
      "request-id",
    );
    assertEquals(result.profileId, profileId);
    assertEquals(result.sent, false);
    assertEquals(result.delivery, "manual_link");
    assertEquals(result.manualInviteUrl, manualLink);
  },
);
