import { App } from "@capacitor/app";
import { z } from "zod";

export const androidUpdatePortal = "https://app.alberring.de/android";
const releaseSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  build: z.number().int().positive().max(2100000000),
});
export type AndroidUpdate = z.infer<typeof releaseSchema>;

export async function checkAndroidUpdate(): Promise<AndroidUpdate | null> {
  const installed = await App.getInfo();
  const build = Number(installed.build);
  if (
    installed.id !== "de.alberring.connect" ||
    !Number.isSafeInteger(build) ||
    build < 1
  )
    return null;
  // Only public version metadata is requested. Never send an employee session
  // or retrieve a binary here; installation stays in the authenticated portal.
  const response = await fetch(
    "https://app.alberring.de/android-release.json",
    {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    },
  );
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  ) {
    throw new Error("Android update metadata unavailable");
  }
  const release = releaseSchema.parse(await response.json());
  return release.build > build ? release : null;
}
