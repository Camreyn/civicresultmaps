const baseResultGeometryStateCodes = new Set(["AZ", "FL", "GA", "MI", "MN", "NC", "NV", "OH", "PA", "VA", "WA", "WI"]);

export function hasBaseResultGeometry(state: string) {
  return baseResultGeometryStateCodes.has(state.toUpperCase());
}
