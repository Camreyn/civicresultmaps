import nativeImportPackages from "../../data/native-import-source-packages.json";
import { legacyImportCatalog, legacyImportStates } from "@/db/legacy-catalog";

export type NativeSourcePackage = (typeof nativeImportPackages.states)[number];

export type NativeSourcePackageArtifact = ReturnType<typeof nativeSourcePackageArtifacts>[number][1];

export type NativeSourcePackageRequest = {
  state: string;
  name: string;
  authority: string;
  priority: number;
  legacyReferenceBundle: string;
  neededArtifacts: Array<{
    key: string;
    label: string;
    requiredFields: string[];
    notes: string;
  }>;
  expectedValidation: string[];
};

export function listNativeSourcePackages(input: { state?: string } = {}) {
  const state = input.state?.toUpperCase();
  const packages = state
    ? nativeImportPackages.states.filter((sourcePackage) => sourcePackage.state === state)
    : nativeImportPackages.states;

  return {
    checkedAt: nativeImportPackages.checkedAt,
    blockedStates: nativeImportPackages.blockedStates ?? [],
    completedNativeStates: nativeImportPackages.completedNativeStates,
    notes: nativeImportPackages.notes,
    purpose: nativeImportPackages.purpose,
    states: packages,
  };
}

export function listNativeSourcePackageRequests(input: { state?: string } = {}) {
  const packagedStates = new Set(nativeImportPackages.states.map((sourcePackage) => sourcePackage.state));
  const completedNativeStates = new Set(nativeImportPackages.completedNativeStates);
  const requestedState = input.state?.toUpperCase();
  const missingStates = legacyImportStates.filter(
    (state) => !packagedStates.has(state) && !completedNativeStates.has(state) && (!requestedState || state === requestedState),
  );

  return {
    checkedAt: nativeImportPackages.checkedAt,
    excludedStates: [...completedNativeStates, ...packagedStates].sort(),
    requestCount: missingStates.length,
    states: missingStates.map((state, index): NativeSourcePackageRequest => {
      const legacyInput = legacyImportCatalog[state];
      return {
        state,
        name: legacyInput.stateName,
        authority: legacyInput.authority,
        priority: index + 1,
        legacyReferenceBundle: legacyInput.localArtifact,
        neededArtifacts: [
          {
            key: "presidentialCountyResults",
            label: "Official 2024 presidential results",
            requiredFields: ["sourceTitle", "sourceUrl", "localFile", "parserHint", "expected county rows", "expected vote totals"],
            notes: "Prefer official certified county or precinct-level artifact. If precinct-level, parser must aggregate to county.",
          },
          {
            key: "localReviewRows",
            label: "Local review rows",
            requiredFields: ["sourceTitle", "sourceUrl", "localFile", "level", "comparisonContest", "parserHint"],
            notes: "Prefer the same reporting-unit grain used by the presidential result artifact.",
          },
          {
            key: "comparisonContest",
            label: "Same-grain comparison contest",
            requiredFields: ["contest name", "candidate/party columns", "join keys", "expected row count"],
            notes: "U.S. Senate is preferred where available; otherwise use a statewide same-party contest with documented caveats.",
          },
          {
            key: "turnout",
            label: "Turnout and registration denominator",
            requiredFields: ["sourceTitle", "sourceUrl", "localFile", "level", "ballotsCast", "denominator"],
            notes: "Document whether turnout is precinct, county, or another reporting level.",
          },
          {
            key: "countyBoundary",
            label: "County boundary GeoJSON",
            requiredFields: ["sourceTitle", "sourceUrl", "localFile", "nameProperty", "codeProperty", "expected geometry features"],
            notes: "County geometry is enough for native county maps. Precinct boundaries can be handled as a later package.",
          },
        ],
        expectedValidation: [
          "All listed local artifacts exist in the repository.",
          "County result row count matches expected county count.",
          "County geometry feature count matches expected county count.",
          "Trump + Harris + Other equals the expected state total.",
          "Review rows normalize to known county names or documented reporting units.",
          "Comparison contest joins at the same reporting-unit grain.",
          "Turnout rows join to county/result geography and include a denominator note.",
          "Every source has URL, authority, parser, local artifact, timestamp basis, confidence, and caveats.",
        ],
      };
    }),
  };
}

export function getNativeSourcePackage(stateCode: string): NativeSourcePackage | undefined {
  return nativeImportPackages.states.find((sourcePackage) => sourcePackage.state === stateCode.toUpperCase());
}

export function nativeSourcePackageArtifacts(sourcePackage: NativeSourcePackage) {
  return [
    ["Results", sourcePackage.artifacts.presidentialCountyResults],
    ["Review", sourcePackage.artifacts.localReviewRows],
    ["Turnout", sourcePackage.artifacts.turnout],
    ["County geometry", sourcePackage.artifacts.countyBoundary],
  ] as const;
}

export function nativeSourcePackageArtifactHint(artifact: NativeSourcePackageArtifact) {
  if ("parserHint" in artifact) {
    return artifact.parserHint;
  }

  if ("denominator" in artifact) {
    return `Turnout denominator: ${artifact.denominator}; ballots cast: ${artifact.ballotsCast}.`;
  }

  return `Join fields: ${artifact.nameProperty} / ${artifact.codeProperty}.`;
}
