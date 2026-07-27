export type EquipmentCatalogChannel = "public" | "staging";

type EquipmentCatalogEnvironment = Record<string, string | undefined>;

export function isEquipmentProductionEnvironment(
  environment: EquipmentCatalogEnvironment = process.env,
) {
  return environment.VERCEL_ENV === "production"
    || (
      environment.NODE_ENV === "production"
      && environment.VERCEL_ENV !== "preview"
    );
}

export function resolveEquipmentCatalogChannel(
  environment: EquipmentCatalogEnvironment = process.env,
): EquipmentCatalogChannel {
  const requested = environment.EQUIPMENT_CATALOG_CHANNEL?.trim().toLowerCase();
  if (requested && requested !== "public" && requested !== "staging") {
    throw new Error("EQUIPMENT_CATALOG_CHANNEL must be either public or staging.");
  }

  const channel = (requested
    ?? (
      environment.VERCEL_ENV === "preview"
      || (environment.NODE_ENV === "development" && !environment.VERCEL)
        ? "staging"
        : "public"
    )) as EquipmentCatalogChannel;

  if (isEquipmentProductionEnvironment(environment) && channel !== "public") {
    throw new Error("Production deployments may only build the public equipment catalog.");
  }

  return channel;
}
