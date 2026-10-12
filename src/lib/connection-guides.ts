import type { PublicResearchDocument } from "./connection-research.ts";

const exampleIds = ["officials-ap", "ap-cnn", "ap-usatodayco-2024", "votecast-usatoday-2020", "trumpjr-kalshi", "harris-verity-inventory-2026", "harris-verity-fielded-2022"];

/** Examples point to public evidence, never a research hypothesis or private draft. */
export function guidedConnections(document: PublicResearchDocument) {
  return exampleIds.flatMap((id) => {
    const claim = document.claims.find((item) => item.id === id);
    const supported = document.evidence.some((item) => item.claimId === id && item.relation === "supports" && item.attribution !== "supplemental" && document.sources.some((source) => source.id === item.sourceId));
    return claim && supported ? [claim] : [];
  });
}
