import {
  changeEmployeeEmail,
  employeeInput,
  type EmailChangeOperations,
} from "./employee-edit.ts";
import { HttpError } from "./security.ts";

const assert = (condition: unknown, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};
const assertEquals = (actual: unknown, expected: unknown) =>
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
  );
const fields = {
  profileId: "a1000000-0000-4000-8000-000000000001",
  firstName: "Alice",
  lastName: "Müller",
  displayName: "Alice Müller",
  employeeNumber: null,
  workPhone: null,
  jobTitle: null,
  employmentStatus: "active",
  startDate: "2026-01-01",
  endDate: null,
  birthDate: "1990-01-01",
  weeklyHours: 32,
};

Deno.test(
  "employee validation accepts optional values but excludes account and role mutations",
  () => {
    assert(employeeInput.safeParse(fields).success);
    assert(!employeeInput.safeParse({ ...fields, status: "active" }).success);
    assert(
      !employeeInput.safeParse({ ...fields, roleId: "super_admin" }).success,
    );
    assert(
      !employeeInput.safeParse({ ...fields, email: "unexpected@example.test" })
        .success,
    );
    assert(!employeeInput.safeParse({ ...fields, weeklyHours: 81 }).success);
    assert(
      !employeeInput.safeParse({ ...fields, endDate: "2025-12-31" }).success,
    );
    assert(
      !employeeInput.safeParse({ ...fields, startDate: "2026-02-30" }).success,
    );
  },
);

function fixture() {
  let email = "old@example.test";
  const calls: string[] = [];
  const operations: EmailChangeOperations = {
    getAuth: async () => ({ email, confirmed: false }),
    updateAuth: async (next, confirmed) => {
      assertEquals(confirmed, false);
      calls.push(`auth:${next}`);
      email = next;
    },
    invalidateLinks: async (next) => {
      calls.push(`rotate:${next}`);
    },
    complete: async () => {
      calls.push("complete");
    },
    readState: async () => "pending",
    cancel: async (restored) => {
      calls.push(`cancel:${restored}`);
    },
  };
  return { operations, calls, getEmail: () => email };
}

Deno.test(
  "changing an invitation rotates its link without sending mail before the profile commit",
  async () => {
    const { operations, calls, getEmail } = fixture();
    await changeEmployeeEmail(operations, "new@example.test");
    assertEquals(calls, [
      "auth:new@example.test",
      "rotate:new@example.test",
      "complete",
    ]);
    assertEquals(getEmail(), "new@example.test");
  },
);

Deno.test(
  "profile failure restores the original Auth email and rotates links again",
  async () => {
    const { operations, calls, getEmail } = fixture();
    const failure = new Error("profile_update_failed");
    operations.complete = async () => {
      throw failure;
    };
    try {
      await changeEmployeeEmail(operations, "new@example.test");
      throw new Error("Expected failure");
    } catch (error) {
      assertEquals(error, failure);
    }
    assertEquals(getEmail(), "old@example.test");
    assertEquals(calls, [
      "auth:new@example.test",
      "rotate:new@example.test",
      "auth:old@example.test",
      "rotate:old@example.test",
      "cancel:true",
    ]);
  },
);

Deno.test(
  "an Auth rejection keeps the profile unchanged and releases its reservation",
  async () => {
    const { operations, calls, getEmail } = fixture();
    operations.updateAuth = async () => {
      throw new HttpError(409, "email_not_available", "E-Mail belegt");
    };
    try {
      await changeEmployeeEmail(operations, "new@example.test");
      throw new Error("Expected failure");
    } catch (error) {
      assert(
        error instanceof HttpError && error.code === "email_not_available",
      );
    }
    assertEquals(getEmail(), "old@example.test");
    assertEquals(calls, ["cancel:true"]);
  },
);

Deno.test(
  "an ambiguous committed RPC response never reverts the completed email change",
  async () => {
    const { operations, calls, getEmail } = fixture();
    operations.complete = async () => {
      throw new Error("response_lost_after_commit");
    };
    operations.readState = async () => "completed";
    await changeEmployeeEmail(operations, "new@example.test");
    assertEquals(getEmail(), "new@example.test");
    assertEquals(calls, ["auth:new@example.test", "rotate:new@example.test"]);
  },
);

Deno.test(
  "failed compensation reports partial state and allows a corrective retry",
  async () => {
    const { operations, calls } = fixture();
    const update = operations.updateAuth;
    operations.updateAuth = async (email, confirmed) => {
      if (email === "old@example.test") throw new Error("auth_unavailable");
      await update(email, confirmed);
    };
    operations.complete = async () => {
      throw new Error("profile_update_failed");
    };
    try {
      await changeEmployeeEmail(operations, "new@example.test");
      throw new Error("Expected failure");
    } catch (error) {
      assert(
        error instanceof HttpError &&
          error.code === "email_change_partial_failure",
      );
    }
    assert(calls.includes("cancel:false"));
  },
);

Deno.test(
  "unavailable completion readback does not blindly revert a potentially committed change",
  async () => {
    const { operations, calls } = fixture();
    operations.complete = async () => {
      throw new Error("response_lost");
    };
    operations.readState = async () => {
      throw new Error("database_unavailable");
    };
    try {
      await changeEmployeeEmail(operations, "new@example.test");
      throw new Error("Expected failure");
    } catch (error) {
      assert(
        error instanceof HttpError && error.code === "email_change_unknown",
      );
    }
    assertEquals(calls, ["auth:new@example.test", "rotate:new@example.test"]);
  },
);

Deno.test(
  "a retry can reconcile an already-correct Auth email without another token change",
  async () => {
    const { operations, calls } = fixture();
    operations.getAuth = async () => ({
      email: "new@example.test",
      confirmed: true,
    });
    await changeEmployeeEmail(operations, "new@example.test");
    assertEquals(calls, ["complete"]);
  },
);
