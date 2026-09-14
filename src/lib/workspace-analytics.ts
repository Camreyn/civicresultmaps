import { isSupportedPresidentialYear, type SupportedPresidentialYear } from "./api-version.ts";
import { usStateOptions } from "./us-states.ts";

export const stateLoadedEventName = "state_loaded";
export type StateLoadSelection = "default" | "explicit";
type StateCode = (typeof usStateOptions)[number][0];

const stateCodes = new Set<string>(usStateOptions.map(([code]) => code));

export function stateLoadProperties(
  state: string,
  year: number,
  selection: StateLoadSelection,
): { state: StateCode; year: SupportedPresidentialYear; selection: StateLoadSelection } | null {
  if (
    !stateCodes.has(state) ||
    !isSupportedPresidentialYear(year) ||
    (selection !== "default" && selection !== "explicit")
  ) {
    return null;
  }

  return { state: state as StateCode, year, selection };
}
