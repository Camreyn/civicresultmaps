export type LocalGeographyParentScope = {
  level: "county" | "house_district";
  singularLabel: "county" | "House District";
  pluralLabel: "counties" | "House Districts";
};

const countyGeoidPattern = /^\d{5}$/;
const alaskaHouseDistrictPattern = /^HD(?:0[1-9]|[1-3][0-9]|40)$/;

export const ALASKA_HOUSE_DISTRICT_PARENT_IDS = Object.freeze(
  Array.from({ length: 40 }, (_, index) => (
    `HD${String(index + 1).padStart(2, "0")}`
  )),
);

export function localGeographyParentScope(input: {
  state: string;
  geographyLevel: string;
}): LocalGeographyParentScope | null {
  const state = input.state.trim().toUpperCase();
  const geographyLevel = input.geographyLevel.trim().toLowerCase();
  if (state === "AK" && geographyLevel === "precinct") {
    return {
      level: "house_district",
      singularLabel: "House District",
      pluralLabel: "House Districts",
    };
  }
  if (
    geographyLevel === "precinct"
    || geographyLevel === "local_reporting_unit"
  ) {
    return {
      level: "county",
      singularLabel: "county",
      pluralLabel: "counties",
    };
  }
  return null;
}

export function isSupportedLocalGeographyParentId(value: string) {
  const normalized = value.trim();
  return countyGeoidPattern.test(normalized)
    || alaskaHouseDistrictPattern.test(normalized);
}

export function isValidLocalGeographyParentId(input: {
  state: string;
  geographyLevel: string;
  parentGeoid: string;
}) {
  const scope = localGeographyParentScope(input);
  if (!scope) return false;
  const parentGeoid = input.parentGeoid.trim();
  return scope.level === "house_district"
    ? alaskaHouseDistrictPattern.test(parentGeoid)
    : countyGeoidPattern.test(parentGeoid);
}

export function isValidLocalGeographyDeliveryParentId(
  state: string,
  parentGeoid: string,
) {
  const normalizedState = state.trim().toUpperCase();
  const normalizedParent = parentGeoid.trim();
  return normalizedState === "AK"
    ? alaskaHouseDistrictPattern.test(normalizedParent)
    : countyGeoidPattern.test(normalizedParent);
}

export function localGeographyDeliveryParentValidationMessage(state: string) {
  return state.trim().toUpperCase() === "AK"
    ? "parentGeoid must be an Alaska House District ID from HD01 through HD40"
    : "parentGeoid must be a five-digit county GEOID";
}

export function localGeographyParentValidationMessage(input: {
  state: string;
  geographyLevel: string;
}) {
  const scope = localGeographyParentScope(input);
  if (scope?.level === "house_district") {
    return "parentGeoid must be an Alaska House District ID from HD01 through HD40";
  }
  if (scope?.level === "county") {
    return "parentGeoid must be a five-digit county GEOID";
  }
  return "parentGeoid is supported only for parent-scoped local results";
}

export function localGeographyParentDisplayName(parentGeoid: string) {
  const normalized = parentGeoid.trim();
  const houseDistrict = normalized.match(
    /^HD(0[1-9]|[1-3][0-9]|40)$/,
  );
  return houseDistrict
    ? `House District ${Number(houseDistrict[1])}`
    : normalized;
}
