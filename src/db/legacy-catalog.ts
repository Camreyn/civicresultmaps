import type { LegacyImportInput } from "./legacy-import";

const legacyRepoRaw =
  "https://raw.githubusercontent.com/Camreyn/wisconsin-2024-election-mapper/main/data";

const stateNames = {
  AK: "Alaska",
  AL: "Alabama",
  AR: "Arkansas",
  AZ: "Arizona",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  IA: "Iowa",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  MA: "Massachusetts",
  MD: "Maryland",
  ME: "Maine",
  MI: "Michigan",
  MN: "Minnesota",
  MO: "Missouri",
  MS: "Mississippi",
  MT: "Montana",
  NC: "North Carolina",
  ND: "North Dakota",
  NE: "Nebraska",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NV: "Nevada",
  NY: "New York",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VA: "Virginia",
  VT: "Vermont",
  WA: "Washington",
  WI: "Wisconsin",
  WV: "West Virginia",
  WY: "Wyoming",
} as const;

const authorityOverrides: Partial<Record<StateCode, string>> = {
  MN: "Minnesota Secretary of State",
  WA: "Washington Secretary of State",
  WI: "Wisconsin Elections Commission",
};

type StateCode = keyof typeof stateNames;

function bundleFile(stateCode: StateCode) {
  return stateCode === "WI" ? "app-data.js" : `${stateCode.toLowerCase()}-app-data.js`;
}

function legacyInputForState(stateCode: StateCode): LegacyImportInput {
  const stateName = stateNames[stateCode];
  const file = bundleFile(stateCode);

  return {
    stateCode,
    stateName,
    authority: authorityOverrides[stateCode] ?? `${stateName} election authority`,
    sourceSlug: `${stateCode.toLowerCase()}-2024-president-county-results`,
    sourceTitle: `${stateName} 2024 presidential county results`,
    sourceUrl: `${legacyRepoRaw}/${file}`,
    localArtifact: `data/${file}`,
    parser: "legacyStaticAppData",
    timestampBasis: "Legacy static project generated bundle from official state election sources.",
    confidence: "Imported from the legacy Civic Result Maps source inventory.",
    bundleUrl: `${legacyRepoRaw}/${file}`,
  };
}

export const legacyImportCatalog = Object.fromEntries(
  (Object.keys(stateNames) as StateCode[]).map((stateCode) => [stateCode, legacyInputForState(stateCode)]),
) as Record<StateCode, LegacyImportInput>;

export const legacyImportStates = Object.keys(legacyImportCatalog).sort() as StateCode[];
