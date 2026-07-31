import { z } from "zod";
export const loginSchema = z.object({
  email: z.email("Bitte eine gültige E-Mail-Adresse eingeben."),
  password: z.string().min(1, "Passwort eingeben."),
});
export const passwordSchema = z
  .string()
  .min(12, "Mindestens 12 Zeichen.")
  .regex(/[A-Z]/, "Mindestens ein Großbuchstabe.")
  .regex(/[a-z]/, "Mindestens ein Kleinbuchstabe.")
  .regex(/\d/, "Mindestens eine Zahl.");
export const mileageSchema = z
  .object({
    mileage: z.number().int().nonnegative(),
    previous: z.number().int().nonnegative(),
  })
  .refine((v) => v.mileage >= v.previous, {
    message:
      "Der Kilometerstand darf nicht unter dem letzten bestätigten Wert liegen.",
    path: ["mileage"],
  });
export const fileAllowed = (
  file: Pick<File, "type" | "size">,
  types: string[],
  maxMb: number,
) => types.includes(file.type) && file.size <= maxMb * 1024 * 1024;
