export type LocalGeographyParentScope = {
  level: "county" | "house_district";
  singularLabel: "county" | "House District";
  pluralLabel: "counties" | "House Districts";
};

const countyGeoidPattern = /^\d{5}$/;
const alaskaHouseDistrictPattern = /^HD(?:0[1-9]|[1-3][0-9]|40)$/;

const stateFipsByPostal: Readonly<Record<string, string>> = Object.freeze({
  AL: "01",
  AK: "02",
  AZ: "04",
  AR: "05",
  CA: "06",
  CO: "08",
  CT: "09",
  DE: "10",
  DC: "11",
  FL: "12",
  GA: "13",
  HI: "15",
  ID: "16",
  IL: "17",
  IN: "18",
  IA: "19",
  KS: "20",
  KY: "21",
  LA: "22",
  ME: "23",
  MD: "24",
  MA: "25",
  MI: "26",
  MN: "27",
  MS: "28",
  MO: "29",
  MT: "30",
  NE: "31",
  NV: "32",
  NH: "33",
  NJ: "34",
  NM: "35",
  NY: "36",
  NC: "37",
  ND: "38",
  OH: "39",
  OK: "40",
  OR: "41",
  PA: "42",
  RI: "44",
  SC: "45",
  SD: "46",
  TN: "47",
  TX: "48",
  UT: "49",
  VT: "50",
  VA: "51",
  WA: "53",
  WV: "54",
  WI: "55",
  WY: "56",
});

function countyGeoidMatchesState(state: string, parentGeoid: string) {
  const normalizedState = state.trim().toUpperCase();
  const normalizedParent = parentGeoid.trim();
  const stateFips = stateFipsByPostal[normalizedState];
  return Boolean(
    stateFips
    && countyGeoidPattern.test(normalizedParent)
    && normalizedParent.startsWith(stateFips)
  );
}

function countyParentValidationMessage(state: string) {
  const normalizedState = state.trim().toUpperCase();
  const stateFips = stateFipsByPostal[normalizedState];
  return stateFips
    ? "parentGeoid must be a five-digit county GEOID beginning with "
      + stateFips + " for " + normalizedState
    : "parentGeoid must be a five-digit county GEOID for a supported state";
}

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
    || geographyLevel === "vtd"
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
    : countyGeoidMatchesState(input.state, parentGeoid);
}

export function isValidLocalGeographyDeliveryParentId(
  state: string,
  parentGeoid: string,
) {
  const normalizedState = state.trim().toUpperCase();
  const normalizedParent = parentGeoid.trim();
  return normalizedState === "AK"
    ? alaskaHouseDistrictPattern.test(normalizedParent)
    : countyGeoidMatchesState(normalizedState, normalizedParent);
}

export function localGeographyDeliveryParentValidationMessage(state: string) {
  return state.trim().toUpperCase() === "AK"
    ? "parentGeoid must be an Alaska House District ID from HD01 through HD40"
    : countyParentValidationMessage(state);
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
    return countyParentValidationMessage(input.state);
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
