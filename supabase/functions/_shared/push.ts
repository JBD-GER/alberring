/** Provider credentials are read only by Edge Functions, never by the client. */
export type PushDevice = {
  id: string;
  platform: "ios" | "android";
  push_token: string;
  push_environment: "development" | "production";
};
export type PushResult =
  | { status: "sent"; messageId: string }
  | { status: "invalid" | "retry" | "unconfigured" | "failed"; code: string };
type Environment = (name: string) => string | undefined;
const encoder = new TextEncoder();
const b64 = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value))
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
const json64 = (value: unknown) => b64(encoder.encode(JSON.stringify(value)));
const decodePem = (value: string) =>
  Uint8Array.from(
    atob(value.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")),
    (character) => character.charCodeAt(0),
  );
const http = (url: string, init: RequestInit) =>
  fetch(url, {
    ...init,
    signal: AbortSignal.timeout(8_000),
    redirect: "error",
  });

export function safePushPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 500 ||
    /[\\\r\n%]/.test(value)
  )
    return "/app/notifications";
  return /^\/app\/(?:dashboard|messages|news|schedule|leave|sick-leave|documents|fleet|material-requests|notifications)(?:\/[A-Za-z0-9_-]+)*(?:\?[A-Za-z0-9_=&-]*)?$/.test(
    value,
  )
    ? value
    : "/app/notifications";
}
export const genericPush = (
  notificationId: string,
  targetPath: string | null,
) => ({
  title: "Alberring Connect",
  body: "Eine neue Mitteilung ist verfügbar. Öffnen Sie die App.",
  notificationId,
  target_path: safePushPath(targetPath),
});
export function notificationCategory(type: string): string {
  if (type.startsWith("message")) return "messages";
  if (type.startsWith("news")) return "news";
  if (type.startsWith("shift") || type === "schedule") return "schedule";
  if (type.startsWith("leave")) return "leave";
  if (type.startsWith("sick")) return "sick_leave";
  if (type.startsWith("document")) return "documents";
  if (type.startsWith("mileage") || type.startsWith("vehicle")) return "fleet";
  if (type.startsWith("material")) return "materials";
  if (type === "birthday") return "birthdays";
  return "system";
}
export function inQuietHours(
  start: string | null,
  end: string | null,
  timezone: string,
  now = new Date(),
): boolean {
  if (!start || !end || start === end) return false;
  try {
    const current = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now);
    const from = start.slice(0, 5),
      until = end.slice(0, 5);
    return from < until
      ? current >= from && current < until
      : current >= from || current < until;
  } catch {
    // Unknown timezone: fail closed until the preference is corrected.
    return true;
  }
}

async function signedJwt(
  header: object,
  payload: object,
  privateKey: string,
  algorithm: "ES256" | "RS256",
): Promise<string> {
  const data = `${json64(header)}.${json64(payload)}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    decodePem(privateKey),
    algorithm === "ES256"
      ? { name: "ECDSA", namedCurve: "P-256" }
      : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    algorithm === "ES256"
      ? { name: "ECDSA", hash: "SHA-256" }
      : "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(data),
  );
  return `${data}.${b64(new Uint8Array(signature))}`;
}

export function classifyPushResponse(
  provider: "apns" | "fcm",
  status: number,
  body: unknown,
): PushResult {
  const value = body as {
    reason?: string;
    name?: string;
    error?: { status?: string; details?: { errorCode?: string }[] };
  } | null;
  if (status >= 200 && status < 300)
    return { status: "sent", messageId: value?.name ?? "accepted" };
  const code =
    provider === "apns"
      ? value?.reason
      : (value?.error?.details?.find((detail) => detail.errorCode)?.errorCode ??
        value?.error?.status);
  if (
    provider === "apns" &&
    ["Unregistered", "BadDeviceToken", "DeviceTokenNotForTopic"].includes(
      code ?? "",
    )
  )
    return { status: "invalid", code: `apns_${code}` };
  if (provider === "fcm" && code === "UNREGISTERED")
    return { status: "invalid", code: "fcm_unregistered" };
  if (status === 429 || status >= 500)
    return { status: "retry", code: `${provider}_temporary_failure` };
  // Authentication/configuration failures must never erase valid device tokens.
  return { status: "failed", code: `${provider}_rejected_${status}` };
}

export function createPushSender(
  env: Environment = (name) => Deno.env.get(name),
) {
  let apnsJwt: { value: string; until: number } | null = null;
  let fcmAccess: { value: string; until: number } | null = null;
  return async (
    device: PushDevice,
    notificationId: string,
    targetPath: string | null,
  ): Promise<PushResult> => {
    const payload = genericPush(notificationId, targetPath);
    const now = Math.floor(Date.now() / 1000);
    try {
      if (device.platform === "ios") {
        const key = env("APNS_PRIVATE_KEY"),
          keyId = env("APNS_KEY_ID"),
          teamId = env("APNS_TEAM_ID"),
          topic =
            device.push_environment === "development"
              ? (env("APNS_DEVELOPMENT_BUNDLE_ID") ?? env("APNS_BUNDLE_ID"))
              : env("APNS_BUNDLE_ID");
        if (!key || !keyId || !teamId || !topic)
          return { status: "unconfigured", code: "apns_not_configured" };
        if (!apnsJwt || apnsJwt.until <= now)
          apnsJwt = {
            value: await signedJwt(
              { alg: "ES256", kid: keyId },
              { iss: teamId, iat: now },
              key,
              "ES256",
            ),
            until: now + 3000,
          };
        const host =
          device.push_environment === "development"
            ? "api.sandbox.push.apple.com"
            : "api.push.apple.com";
        const response = await http(
          `https://${host}/3/device/${encodeURIComponent(device.push_token)}`,
          {
            method: "POST",
            headers: {
              authorization: `bearer ${apnsJwt.value}`,
              "apns-topic": topic,
              "apns-push-type": "alert",
              "apns-priority": "10",
              "apns-expiration": String(now + 3600),
              "apns-collapse-id": notificationId,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              aps: {
                alert: { title: payload.title, body: payload.body },
                sound: "default",
                badge: 1,
              },
              notificationId,
              target_path: payload.target_path,
            }),
          },
        );
        const result = classifyPushResponse(
          "apns",
          response.status,
          await response.json().catch(() => null),
        );
        return result.status === "sent"
          ? {
              ...result,
              messageId: response.headers.get("apns-id") ?? notificationId,
            }
          : result;
      }
      const config = env("FCM_SERVICE_ACCOUNT_JSON");
      if (!config)
        return { status: "unconfigured", code: "fcm_not_configured" };
      const service = JSON.parse(config) as {
        project_id?: string;
        private_key?: string;
        client_email?: string;
      };
      if (
        !service.project_id ||
        !service.private_key ||
        !service.client_email ||
        !/^[a-z0-9-]+$/.test(service.project_id)
      )
        return { status: "failed", code: "fcm_configuration_invalid" };
      if (!fcmAccess || fcmAccess.until <= now) {
        const assertion = await signedJwt(
          { alg: "RS256", typ: "JWT" },
          {
            iss: service.client_email,
            scope: "https://www.googleapis.com/auth/firebase.messaging",
            aud: "https://oauth2.googleapis.com/token",
            iat: now,
            exp: now + 3600,
          },
          service.private_key,
          "RS256",
        );
        const response = await http("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion,
          }),
        });
        const token = (await response.json()) as {
          access_token?: string;
          expires_in?: number;
        };
        if (!response.ok || !token.access_token)
          return { status: "failed", code: "fcm_authorization_failed" };
        fcmAccess = {
          value: token.access_token,
          until: now + Math.min(token.expires_in ?? 3600, 3600) - 60,
        };
      }
      const response = await http(
        `https://fcm.googleapis.com/v1/projects/${service.project_id}/messages:send`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${fcmAccess.value}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: device.push_token,
              notification: { title: payload.title, body: payload.body },
              data: { notificationId, target_path: payload.target_path },
              android: {
                priority: "high",
                ttl: "3600s",
                notification: {
                  channel_id: "alberring-updates",
                  sound: "default",
                  tag: notificationId,
                },
              },
            },
          }),
        },
      );
      return classifyPushResponse(
        "fcm",
        response.status,
        await response.json().catch(() => null),
      );
    } catch {
      // Tokens, payloads and private keys must never enter error logs.
      return { status: "retry", code: "push_transport_or_configuration_error" };
    }
  };
}
