import type { SupabaseClient } from "npm:@supabase/supabase-js@2.110.2";
import { permissionRecipients } from "./jobs.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
};

type Filter = { column: string; value: unknown };

function queryFor(
  table: string,
  calls: Array<{ table: string; filters: Filter[] }>,
) {
  const filters: Filter[] = [];
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.push({ column, value });
      return query;
    },
    in: (column: string, value: unknown) => {
      filters.push({ column, value });
      return query;
    },
    lte: (column: string, value: unknown) => {
      filters.push({ column, value });
      return query;
    },
    or: (value: string) => {
      filters.push({ column: "or", value });
      return query;
    },
    then: (
      resolve: (value: { data: unknown[]; error: null }) => unknown,
      reject: (reason: unknown) => unknown,
    ) => {
      calls.push({ table, filters: [...filters] });
      const roleIds = filters.find((filter) => filter.column === "role_id")
        ?.value as string[] | undefined;
      const profileIds = filters.find((filter) => filter.column === "id")
        ?.value as string[] | undefined;
      const data =
        table === "role_permissions"
          ? [{ role_id: "active-role" }, { role_id: "inactive-role" }]
          : table === "roles"
            ? [{ id: "active-role" }]
            : table === "user_roles" && roleIds?.includes("active-role")
              ? [{ profile_id: "active-recipient" }]
              : table === "profiles" && profileIds?.includes("active-recipient")
                ? [{ id: "active-recipient" }]
                : [];
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return query;
}

Deno.test(
  "notification recipients exclude inactive and foreign roles",
  async () => {
    const calls: Array<{ table: string; filters: Filter[] }> = [];
    const admin = {
      from: (table: string) => queryFor(table, calls),
    } as unknown as SupabaseClient;

    const recipients = await permissionRecipients(
      admin,
      "organization-a",
      "birthdays.view_admin_notifications",
    );

    assertEquals(recipients, ["active-recipient"]);
    const roleCall = calls.find((call) => call.table === "roles");
    assertEquals(
      roleCall?.filters.some(
        (filter) =>
          filter.column === "organization_id" &&
          filter.value === "organization-a",
      ),
      true,
    );
    assertEquals(
      roleCall?.filters.some(
        (filter) => filter.column === "active" && filter.value === true,
      ),
      true,
    );
    const assignmentCall = calls.find((call) => call.table === "user_roles");
    assertEquals(
      assignmentCall?.filters.find((filter) => filter.column === "role_id")
        ?.value,
      ["active-role"],
    );
  },
);
