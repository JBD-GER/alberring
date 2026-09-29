import { userDeletionError } from "./user-deletion.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  if (actual !== expected)
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
};

Deno.test(
  "protected identities and inaccessible profiles remain denied",
  () => {
    assertEquals(
      userDeletionError({ message: "permission_denied" })?.status,
      403,
    );
    assertEquals(
      userDeletionError({ message: "cannot_delete_own_account" })?.status,
      403,
    );
    assertEquals(
      userDeletionError({ message: "profile_not_found" })?.status,
      404,
    );
  },
);

Deno.test("last Super Admin protection is an actionable conflict", () => {
  const result = userDeletionError({
    message: "last_super_admin_cannot_be_deleted",
  });
  assertEquals(result?.status, 409);
  assertEquals(result?.message.includes("aktiver Super Admin"), true);
});

Deno.test("in-flight account operations ask the administrator to wait", () => {
  const result = userDeletionError({
    message: "account_operation_in_progress",
  });
  assertEquals(result?.status, 409);
  assertEquals(result?.message.includes("warten"), true);
});

Deno.test("unknown database errors use the generic handler", () => {
  assertEquals(
    userDeletionError({ message: "unexpected internal table details" }),
    null,
  );
});
