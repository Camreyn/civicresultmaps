import coverage from "./map-geometry-coverage.json";

const baseResultGeometryStateCodes = new Set(coverage.baseResultGeometryStates);

export function hasBaseResultGeometry(state: string) {
  return baseResultGeometryStateCodes.has(state.toUpperCase());
}
