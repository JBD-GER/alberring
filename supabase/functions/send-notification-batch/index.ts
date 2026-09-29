import { z } from "npm:zod@4.4.3";
import { corsHeaders, json } from "../_shared/http.ts";
import {
  handlerError,
  HttpError,
  preflight,
  requireAutomation,
} from "../_shared/security.ts";
import {
  createPushSender,
  inQuietHours,
  notificationCategory,
  type PushDevice,
} from "../_shared/push.ts";

const input = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(10)
    .transform((value) => Math.min(value, 10)),
});
const sendPush = createPushSender();

type Delivery = {
  id: string;
  channel: string;
  attempt_count: number;
  notification_id: string;
  profile_id: string;
  organization_id: string;
  target_path: string | null;
};

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID(),
    origin = req.headers.get("origin");
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
    const admin = requireAutomation(req);
    const parsed = input.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success)
      throw new HttpError(
        422,
        "invalid_input",
        "Batch-Konfiguration ist ungültig.",
      );
    const { data, error } = await admin.rpc("claim_notification_batch", {
      p_limit: parsed.data.limit,
    });
    if (error) throw error;
    const counts = { delivered: 0, skipped: 0, deferred: 0, failed: 0 };
    const process = async (delivery: Delivery) => {
      const finish = async (
        status: "delivered" | "skipped" | "failed" | "pending",
        code: string | null = null,
        delaySeconds = 0,
        consumeAttempt = true,
      ) => {
        const { error: updateError } = await admin
          .from("notification_deliveries")
          .update({
            status,
            last_error_code: code,
            sent_at: status === "delivered" ? new Date().toISOString() : null,
            next_attempt_at:
              status === "pending"
                ? new Date(Date.now() + delaySeconds * 1000).toISOString()
                : null,
            attempt_count: consumeAttempt
              ? delivery.attempt_count
              : Math.max(0, delivery.attempt_count - 1),
          })
          .eq("id", delivery.id)
          .eq("status", "pending")
          .eq("attempt_count", delivery.attempt_count);
        if (updateError) throw updateError;
        counts[status === "pending" ? "deferred" : status] += 1;
      };
      if (delivery.channel === "in_app") return await finish("delivered");
      if (delivery.channel !== "push")
        return await finish("skipped", "provider_not_configured");
      const { data: notification, error: notificationError } = await admin
        .from("notifications")
        .select("type")
        .eq("id", delivery.notification_id)
        .single();
      if (notificationError) throw notificationError;
      const { data: preference, error: preferenceError } = await admin
        .from("notification_preferences")
        .select("push_enabled,quiet_hours_start,quiet_hours_end,timezone")
        .eq("profile_id", delivery.profile_id)
        .eq("organization_id", delivery.organization_id)
        .eq("category", notificationCategory(notification.type))
        .maybeSingle();
      if (preferenceError) throw preferenceError;
      if (!preference?.push_enabled)
        return await finish("skipped", "push_disabled");
      if (
        inQuietHours(
          preference.quiet_hours_start,
          preference.quiet_hours_end,
          preference.timezone,
        )
      )
        return await finish("pending", "quiet_hours", 900, false);
      const [
        { data: devices, error: deviceError },
        { data: receipts, error: receiptError },
      ] = await Promise.all([
        admin.rpc("active_push_devices", { p_profile_id: delivery.profile_id }),
        admin
          .from("push_delivery_receipts")
          .select("device_id")
          .eq("delivery_id", delivery.id),
      ]);
      if (deviceError) throw deviceError;
      if (receiptError) throw receiptError;
      const sentIds = new Set(
        (receipts ?? []).map((receipt) => receipt.device_id),
      );
      const targets = ((devices ?? []) as PushDevice[]).filter(
        (device) => !sentIds.has(device.id),
      );
      let accepted = sentIds.size,
        deferred = false,
        retry = false,
        failed = false;
      // Cap fanout concurrency while preserving successful per-device receipts.
      for (let offset = 0; offset < targets.length; offset += 3) {
        await Promise.all(
          targets.slice(offset, offset + 3).map(async (device) => {
            const result = await sendPush(
              device,
              delivery.notification_id,
              delivery.target_path,
            );
            if (result.status === "sent") {
              const { error: savedError } = await admin
                .from("push_delivery_receipts")
                .upsert(
                  {
                    delivery_id: delivery.id,
                    device_id: device.id,
                    provider_message_id: result.messageId,
                  },
                  { onConflict: "delivery_id,device_id" },
                );
              if (savedError) throw savedError;
              accepted += 1;
            } else if (result.status === "invalid") {
              // The equality predicate prevents late provider errors from revoking
              // a token that has already rotated on this installation.
              const { error: revokeError } = await admin
                .from("user_devices")
                .update({
                  revoked_at: new Date().toISOString(),
                  push_token: null,
                })
                .eq("id", device.id)
                .eq("push_token", device.push_token);
              if (revokeError) throw revokeError;
            } else if (result.status === "unconfigured") deferred = true;
            else if (result.status === "retry") retry = true;
            else failed = true;
          }),
        );
      }
      if (deferred)
        return await finish("pending", "provider_not_configured", 3600, false);
      if (retry && delivery.attempt_count < 8)
        return await finish(
          "pending",
          "push_retry",
          Math.min(3600, 60 * 2 ** (delivery.attempt_count - 1)),
        );
      if (retry || failed)
        return await finish("failed", "push_provider_failed");
      return await finish(
        accepted ? "delivered" : "skipped",
        accepted ? null : "no_active_devices",
      );
    };
    const deliveries = (data ?? []) as Delivery[];
    for (let offset = 0; offset < deliveries.length; offset += 5) {
      await Promise.all(deliveries.slice(offset, offset + 5).map(process));
    }
    return json(counts, 200, requestId, corsHeaders(origin));
  } catch (error) {
    return handlerError(error, requestId, origin);
  }
});
