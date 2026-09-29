import {
  classifyPushResponse,
  createPushSender,
  genericPush,
  inQuietHours,
  notificationCategory,
  safePushPath,
} from "./push.ts";
const equal = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Unexpected value: ${JSON.stringify(actual)}`);
};
Deno.test("push rejects external and encoded navigation targets", () => {
  for (const path of [
    "https://attacker.test",
    "//attacker.test",
    "/messages/%2f%2fattacker",
    "/messages\\evil",
    "/admin",
    "/messages\nanything",
  ])
    equal(safePushPath(path), "/app/notifications");
  equal(
    safePushPath("/app/messages?conversation=abc-123"),
    "/app/messages?conversation=abc-123",
  );
});
Deno.test("push payload contains no employee or notification content", () => {
  equal(genericPush("notification-id", "/app/leave"), {
    title: "Alberring Connect",
    body: "Eine neue Mitteilung ist verfügbar. Öffnen Sie die App.",
    notificationId: "notification-id",
    target_path: "/app/leave",
  });
});
Deno.test("APNs/FCM only revoke documented invalid tokens", () => {
  equal(
    classifyPushResponse("apns", 410, { reason: "Unregistered" }).status,
    "invalid",
  );
  equal(
    classifyPushResponse("fcm", 404, {
      error: { details: [{ errorCode: "UNREGISTERED" }] },
    }).status,
    "invalid",
  );
  equal(
    classifyPushResponse("fcm", 400, { error: { status: "INVALID_ARGUMENT" } })
      .status,
    "failed",
  );
  equal(
    classifyPushResponse("apns", 403, { reason: "InvalidProviderToken" })
      .status,
    "failed",
  );
  equal(classifyPushResponse("apns", 503, {}).status, "retry");
  equal(classifyPushResponse("fcm", 429, {}).status, "retry");
  equal(classifyPushResponse("fcm", 200, { name: "message-id" }), {
    status: "sent",
    messageId: "message-id",
  });
});
Deno.test("missing provider credentials do not contact networks", async () => {
  const send = createPushSender(() => undefined);
  for (const platform of ["ios", "android"] as const)
    equal(
      (
        await send(
          {
            id: "device-id",
            platform,
            push_token: "unconfigured-test-token",
            push_environment: "production",
          },
          "notification-id",
          "/app/messages",
        )
      ).status,
      "unconfigured",
    );
});
Deno.test(
  "quiet hours handle midnight and daylight time in specified timezone",
  () => {
    equal(
      inQuietHours(
        "22:00:00",
        "06:00:00",
        "Europe/Berlin",
        new Date("2026-09-17T21:00:00Z"),
      ),
      true,
    );
    equal(
      inQuietHours(
        "22:00:00",
        "06:00:00",
        "Europe/Berlin",
        new Date("2026-09-17T10:00:00Z"),
      ),
      false,
    );
    equal(inQuietHours(null, null, "Europe/Berlin"), false);
    equal(inQuietHours("22:00", "06:00", "invalid/timezone"), true);
  },
);
Deno.test("notification categories match existing queue conventions", () => {
  equal(notificationCategory("message_created"), "messages");
  equal(notificationCategory("sick_leave_reported"), "sick_leave");
  equal(notificationCategory("mileage_reminder"), "fleet");
  equal(notificationCategory("birthday"), "birthdays");
});

const pem = async (key: CryptoKey) => {
  const exported = new Uint8Array(await crypto.subtle.exportKey("pkcs8", key));
  return `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...exported))}\n-----END PRIVATE KEY-----`;
};
Deno.test(
  "APNs uses signed sandbox request, approved channel and private generic payload",
  async () => {
    const keys = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const privateKey = await pem(keys.privateKey);
    const original = globalThis.fetch;
    let requests = 0;
    globalThis.fetch = async (input, init) => {
      requests++;
      equal(
        String(input).startsWith(
          "https://api.sandbox.push.apple.com/3/device/",
        ),
        true,
      );
      const headers = new Headers(init?.headers);
      equal(headers.get("apns-push-type"), "alert");
      equal(headers.get("apns-topic"), "de.example.audit.dev");
      const jwt = headers.get("authorization")!.slice(7).split(".");
      const signature = Uint8Array.from(
        atob(jwt[2].replaceAll("-", "+").replaceAll("_", "/")),
        (c) => c.charCodeAt(0),
      );
      equal(
        await crypto.subtle.verify(
          { name: "ECDSA", hash: "SHA-256" },
          keys.publicKey,
          signature,
          new TextEncoder().encode(`${jwt[0]}.${jwt[1]}`),
        ),
        true,
      );
      const body = JSON.parse(String(init?.body));
      equal(body.target_path, "/app/notifications");
      equal(
        body.aps.alert.body,
        "Eine neue Mitteilung ist verfügbar. Öffnen Sie die App.",
      );
      return new Response(null, {
        status: 200,
        headers: { "apns-id": "receipt-id" },
      });
    };
    try {
      const values: Record<string, string> = {
        APNS_PRIVATE_KEY: privateKey,
        APNS_KEY_ID: "TESTKEY",
        APNS_TEAM_ID: "TESTTEAM",
        APNS_BUNDLE_ID: "de.example.audit",
        APNS_DEVELOPMENT_BUNDLE_ID: "de.example.audit.dev",
      };
      equal(
        await createPushSender((name) => values[name])(
          {
            id: "id",
            platform: "ios",
            push_token: "a".repeat(64),
            push_environment: "development",
          },
          "notification-id",
          "https://unsafe.test",
        ),
        { status: "sent", messageId: "receipt-id" },
      );
      equal(requests, 1);
    } finally {
      globalThis.fetch = original;
    }
  },
);
Deno.test(
  "FCM exchanges server assertion and sends Android notification on configured channel",
  async () => {
    const keys = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const privateKey = await pem(keys.privateKey);
    const original = globalThis.fetch;
    let requests = 0;
    globalThis.fetch = async (input, init) => {
      requests++;
      if (requests === 1) {
        equal(String(input), "https://oauth2.googleapis.com/token");
        equal(
          new URLSearchParams(init?.body as URLSearchParams).get("grant_type"),
          "urn:ietf:params:oauth:grant-type:jwt-bearer",
        );
        return Response.json({
          access_token: "ephemeral-test-value",
          expires_in: 3600,
        });
      }
      equal(
        String(input),
        "https://fcm.googleapis.com/v1/projects/audit-project/messages:send",
      );
      const body = JSON.parse(String(init?.body));
      equal(body.message.android.notification.channel_id, "alberring-updates");
      equal(body.message.data.target_path, "/app/messages");
      return Response.json({ name: "fcm-receipt" });
    };
    try {
      const sender = createPushSender(() =>
        JSON.stringify({
          project_id: "audit-project",
          client_email: "audit@example.test",
          private_key: privateKey,
        }),
      );
      const device = {
        id: "id",
        platform: "android" as const,
        push_token: "c".repeat(64),
        push_environment: "production" as const,
      };
      equal(await sender(device, "notification-id", "/app/messages"), {
        status: "sent",
        messageId: "fcm-receipt",
      });
      await sender(device, "second-notification", "/app/messages");
      equal(requests, 3); // Second send reuses the short-lived OAuth access token.
    } finally {
      globalThis.fetch = original;
    }
  },
);
