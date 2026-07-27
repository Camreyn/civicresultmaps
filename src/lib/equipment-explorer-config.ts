import { isEquipmentProductionEnvironment } from "./equipment-catalog-channel.ts";

type EquipmentExplorerOptions = {
  catalogChannel?: "public" | "staging";
  productionReady?: boolean;
};

function enabledValue(value: string | undefined) {
  if (value === undefined) return null;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function isEquipmentExplorerEnabled({
  catalogChannel = "staging",
  productionReady = false,
}: EquipmentExplorerOptions = {}) {
  const serverEnabled = enabledValue(process.env.EQUIPMENT_EXPLORER_ENABLED);
  const publicEnabled = enabledValue(process.env.NEXT_PUBLIC_EQUIPMENT_EXPLORER);
  const hasExplicitFlag = serverEnabled !== null || publicEnabled !== null;
  const flagsEnabled = hasExplicitFlag
    ? serverEnabled === true && publicEnabled === true
    : process.env.NODE_ENV === "development" && !process.env.VERCEL;

  if (!flagsEnabled) return false;
  if (
    isEquipmentProductionEnvironment()
    && (catalogChannel !== "public" || !productionReady)
  ) return false;
  return true;
}
