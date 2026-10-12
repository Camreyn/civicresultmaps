import { connectionEdges, connectionNodes, connectionSources, connectionsReviewedOn, researchLeads, connectionSourceClass, connectionSourceAttribution } from "./election-connections.ts";
import type { PublicResearchDocument } from "./connection-research.ts";

/** Existing documentary catalog, never advertised as an immutable published release. */
export function legacyExplorerDocument(): PublicResearchDocument {
  return {
    schemaVersion: 2, releaseId: "legacy-documentary-catalog", reviewedOn: connectionsReviewedOn,
    entities: connectionNodes.map((node) => ({ ...node, geography: "national", identifiers: {} })),
    claims: connectionEdges.map((edge) => ({
      id: edge.id, from: edge.from, to: edge.to, label: edge.label, kind: edge.kind, view: edge.view,
      geography: edge.geography ?? (["counties", "team", "texas", "civix"].some((id) => [edge.from, edge.to].includes(id)) ? "TX" : "national"),
      establishes: edge.establishes, limitation: edge.limitation, dated: edge.dated,
      // Documentary availability, not an inferred effective date or continuing role.
      observedOn: edge.observedOn ?? edge.sourceIds.map((id) => connectionSources.find((source) => source.id === id)?.publishedOn).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
      effectiveFrom: null, effectiveTo: null, scope: edge.scope ?? "documented", ownership: null,
    })),
    sources: connectionSources.map((source) => ({ id: source.id, authority: source.authority, title: source.title, url: source.url, sourceClass: connectionSourceClass(source), publishedOn: source.publishedOn ?? null, eventOn: source.eventOn ?? null })),
    revisions: [], contracts: [],
    evidence: connectionEdges.flatMap((edge) => edge.sourceIds.map((sourceId) => ({
      id: `${edge.id}-${sourceId}`, claimId: edge.id, sourceId, revisionId: null, relation: "supports",
      locator: { page: null, section: connectionSources.find((source) => source.id === sourceId)!.review.locator, pointer: null },
      excerpt: "", attribution: connectionSourceAttribution(connectionSources.find((source) => source.id === sourceId)!),
    }))),
    questions: researchLeads.map((lead) => ({ ...lead, status: "open", geography: /Texas|TEAM|SAVE/.test(lead.title) ? "TX" : "national", finding: "", resolutionClaimIds: [] })),
  };
}
