export const publicApiSchemaVersion = "1.0.0";
export const securityIncidentApiSchemaVersion = "4.1.0";
export const equipmentCatalogApiSchemaVersion = "2.0.0";
export const currentNationalReleaseId = "2026-07-11-national-county-v1";

export const supportedPresidentialYears = [2016, 2020, 2024] as const;
export type SupportedPresidentialYear = (typeof supportedPresidentialYears)[number];

export function isSupportedPresidentialYear(value: number): value is SupportedPresidentialYear {
  return supportedPresidentialYears.includes(value as SupportedPresidentialYear);
}
