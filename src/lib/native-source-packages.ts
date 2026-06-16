import nativeImportPackages from "../../data/native-import-source-packages.json";

export type NativeSourcePackage = (typeof nativeImportPackages.states)[number];

export type NativeSourcePackageArtifact = ReturnType<typeof nativeSourcePackageArtifacts>[number][1];

export function listNativeSourcePackages(input: { state?: string } = {}) {
  const state = input.state?.toUpperCase();
  const packages = state
    ? nativeImportPackages.states.filter((sourcePackage) => sourcePackage.state === state)
    : nativeImportPackages.states;

  return {
    checkedAt: nativeImportPackages.checkedAt,
    notes: nativeImportPackages.notes,
    purpose: nativeImportPackages.purpose,
    states: packages,
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
