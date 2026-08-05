import { corsHeaders } from "./http.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  if (actual !== expected)
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
};

Deno.test("CORS only reflects an explicitly allowed production origin", () => {
  const previous = Deno.env.get("ALLOWED_ORIGINS");
  try {
    Deno.env.set(
      "ALLOWED_ORIGINS",
      "https://alberringapp.vercel.app,http://localhost:5173",
    );
    assertEquals(
      corsHeaders("https://alberringapp.vercel.app")[
        "access-control-allow-origin"
      ],
      "https://alberringapp.vercel.app",
    );
    assertEquals(
      corsHeaders("https://attacker.example")["access-control-allow-origin"],
      "",
    );
  } finally {
    if (previous === undefined) Deno.env.delete("ALLOWED_ORIGINS");
    else Deno.env.set("ALLOWED_ORIGINS", previous);
  }
});
