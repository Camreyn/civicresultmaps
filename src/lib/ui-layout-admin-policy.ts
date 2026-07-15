export function parseLayoutAdminAllowlist(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function selectAuthorizedLayoutAdminEmail(
  verifiedEmails: string[],
  allowlistValue: string | undefined,
) {
  const allowlist = parseLayoutAdminAllowlist(allowlistValue);
  return verifiedEmails
    .map((email) => email.trim().toLowerCase())
    .find((email) => allowlist.has(email));
}
