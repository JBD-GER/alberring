export type InviteRole = {
  id: string;
  name: string;
  systemKey: string | null;
};

export type PlannedInvite = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleId: string;
  teamName: string;
};

export const parseNumberList = (value: string, min: number, max: number) => {
  const tokens = value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  const numbers = tokens.map(Number);
  if (
    !numbers.length ||
    numbers.some(
      (number) => !Number.isInteger(number) || number < min || number > max,
    )
  )
    throw new Error(
      `Bitte nur ganze Zahlen zwischen ${min} und ${max} angeben.`,
    );
  return [...new Set(numbers)];
};

export const normalizeTeamNames = (names: string[]) => {
  const normalized = names.map((name) => name.trim());
  if (
    normalized.length < 1 ||
    normalized.length > 8 ||
    normalized.some((name) => name.length < 2 || name.length > 120)
  )
    throw new Error(
      "Bitte legen Sie zwischen einem und acht Teams mit mindestens zwei Zeichen an.",
    );
  const unique = new Set(
    normalized.map((name) => name.toLocaleLowerCase("de")),
  );
  if (unique.size !== normalized.length)
    throw new Error("Jeder Teamname darf nur einmal vorkommen.");
  return normalized;
};

export const prioritizeTeamNames = (names: string[], preferred: string) => {
  const preferredName = preferred.trim().toLocaleLowerCase("de");
  const preferredIndex = names.findIndex(
    (name) => name.trim().toLocaleLowerCase("de") === preferredName,
  );
  if (preferredIndex <= 0) return [...names];
  return [
    names[preferredIndex],
    ...names.filter((_, index) => index !== preferredIndex),
  ];
};

export const activeInvites = (invites: PlannedInvite[]) =>
  invites.filter((invite) =>
    [invite.firstName, invite.lastName, invite.email].some(
      (value) => value.trim().length > 0,
    ),
  );

export const validateInvites = (
  invites: PlannedInvite[],
  roles: InviteRole[],
  teamNames: string[],
) => {
  const active = activeInvites(invites);
  const allowedRoles = new Set(roles.map((role) => role.id));
  const allowedTeams = new Set(
    teamNames.map((team) => team.trim().toLocaleLowerCase("de")),
  );
  const emails = new Set<string>();
  for (const invite of active) {
    const email = invite.email.trim().toLocaleLowerCase("de");
    if (
      !invite.firstName.trim() ||
      !invite.lastName.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    )
      throw new Error(
        "Bitte füllen Sie für jede Einladung Vorname, Nachname und eine gültige E-Mail-Adresse aus.",
      );
    if (!allowedRoles.has(invite.roleId))
      throw new Error(
        "Bitte wählen Sie für jede Einladung eine gültige Rolle.",
      );
    if (
      invite.teamName &&
      !allowedTeams.has(invite.teamName.trim().toLocaleLowerCase("de"))
    )
      throw new Error(
        "Bitte wählen Sie für jede Einladung ein vorhandenes Team.",
      );
    if (emails.has(email))
      throw new Error("Eine E-Mail-Adresse kann nur einmal eingeladen werden.");
    emails.add(email);
  }
  return active.map((invite) => ({
    ...invite,
    firstName: invite.firstName.trim(),
    lastName: invite.lastName.trim(),
    email: invite.email.trim().toLocaleLowerCase("de"),
    teamName: invite.teamName.trim(),
  }));
};
