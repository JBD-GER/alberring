import type { SupabaseClient } from "npm:@supabase/supabase-js@2.110.2";

export async function startJob(
  admin: SupabaseClient,
  jobName: string,
  key: string,
) {
  const { data, error } = await admin
    .from("scheduled_jobs_log")
    .insert({ job_name: jobName, idempotency_key: key, status: "running" })
    .select("id")
    .single();
  if (error?.code === "23505") {
    const { data: existing, error: existingError } = await admin
      .from("scheduled_jobs_log")
      .select("id,status,started_at")
      .eq("job_name", jobName)
      .eq("idempotency_key", key)
      .single();
    if (existingError) throw existingError;
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const retryable =
      existing.status === "failed" ||
      (existing.status === "running" && existing.started_at < staleBefore);
    if (!retryable) return null;
    let retryQuery = admin
      .from("scheduled_jobs_log")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
        processed_count: 0,
        error_code: null,
      })
      .eq("id", existing.id)
      .eq("status", existing.status);
    if (existing.status === "running")
      retryQuery = retryQuery.lt("started_at", staleBefore);
    const { data: retried, error: retryError } = await retryQuery
      .select("id")
      .maybeSingle();
    if (retryError) throw retryError;
    return retried?.id ?? null;
  }
  if (error) throw error;
  return data.id as string;
}

export async function finishJob(
  admin: SupabaseClient,
  id: string,
  processedCount: number,
  errorCode?: string,
) {
  const { error } = await admin
    .from("scheduled_jobs_log")
    .update({
      status: errorCode ? "failed" : "succeeded",
      finished_at: new Date().toISOString(),
      processed_count: processedCount,
      error_code: errorCode ?? null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function permissionRecipients(
  admin: SupabaseClient,
  organizationId: string,
  permission: string,
) {
  const { data: roleRows, error: roleError } = await admin
    .from("role_permissions")
    .select("role_id")
    .eq("permission_key", permission);
  if (roleError) throw roleError;
  const roleIds = [
    ...new Set((roleRows ?? []).map((row: { role_id: string }) => row.role_id)),
  ];
  if (!roleIds.length) return [] as string[];
  const { data: activeRoles, error: activeRolesError } = await admin
    .from("roles")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .in("id", roleIds);
  if (activeRolesError) throw activeRolesError;
  const activeRoleIds = (activeRoles ?? []).map(
    (role: { id: string }) => role.id,
  );
  if (!activeRoleIds.length) return [] as string[];
  const now = new Date().toISOString();
  const { data: assignments, error: assignmentError } = await admin
    .from("user_roles")
    .select("profile_id")
    .eq("organization_id", organizationId)
    .in("role_id", activeRoleIds)
    .lte("valid_from", now)
    .or(`valid_until.is.null,valid_until.gt.${now}`);
  if (assignmentError) throw assignmentError;
  const profileIds = [
    ...new Set(
      (assignments ?? []).map((row: { profile_id: string }) => row.profile_id),
    ),
  ];
  if (!profileIds.length) return [] as string[];
  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("id", profileIds);
  if (profileError) throw profileError;
  return (profiles ?? []).map((profile: { id: string }) => profile.id);
}

export async function insertNotifications(
  admin: SupabaseClient,
  rows: Record<string, unknown>[],
) {
  if (!rows.length) return 0;
  const { data, error } = await admin
    .from("notifications")
    .upsert(rows, {
      onConflict: "profile_id,deduplication_key",
      ignoreDuplicates: true,
    })
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}
