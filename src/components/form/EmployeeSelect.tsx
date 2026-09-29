import { useQuery } from "@tanstack/react-query";
import type { UseFormRegisterReturn } from "react-hook-form";
import { supabase } from "../../lib/supabase";
import { FieldError } from "./WorkflowUI";

export function EmployeeSelect({
  registration,
  error,
  disabled = false,
}: {
  registration: UseFormRegisterReturn<"profileId">;
  error?: string;
  disabled?: boolean;
}) {
  const people = useQuery({
    queryKey: ["absence-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name,email")
        .eq("status", "active")
        .order("display_name");
      if (error) throw error;
      return data as Array<{ id: string; display_name: string; email: string }>;
    },
  });

  return (
    <div>
      <label className="wf-field">
        <span>Mitarbeiter/in</span>
        <select
          {...registration}
          disabled={disabled || people.isPending || Boolean(people.error)}
          aria-invalid={Boolean(error)}
        >
          <option value="">
            {people.isPending
              ? "Mitarbeitende werden geladen …"
              : "Person auswählen"}
          </option>
          {(people.data ?? []).map((person) => (
            <option key={person.id} value={person.id}>
              {person.display_name} · {person.email}
            </option>
          ))}
        </select>
        <FieldError>{error}</FieldError>
      </label>
      {people.error ? (
        <div role="alert">
          Mitarbeitende konnten nicht geladen werden.{" "}
          <button
            type="button"
            className="wf-quiet"
            onClick={() => void people.refetch()}
          >
            Erneut versuchen
          </button>
        </div>
      ) : people.data?.length === 0 ? (
        <p>Es sind noch keine aktiven Mitarbeitenden vorhanden.</p>
      ) : null}
    </div>
  );
}
