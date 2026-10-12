import { connectionJsonDigest } from "./connection-json-digest.ts";
import { publicResearchDocumentSchema, type PublicResearchDocument } from "./connection-research.ts";

const collections = ["entities", "claims", "sources", "revisions", "evidence", "contracts", "questions"] as const;
const fields = ["from", "to", "label", "kind", "view", "geography", "establishes", "limitation", "dated", "observedOn", "effectiveFrom", "effectiveTo", "scope", "ownership"] as const;
const same = (a: unknown, b: unknown) => connectionJsonDigest(a) === connectionJsonDigest(b);

export function validatedRelease(row: { id: string; digest: string; document: unknown }) {
  const document = publicResearchDocumentSchema.parse(row.document);
  if (!/^connections-[a-f0-9]{64}$/.test(document.releaseId) || document.releaseId !== row.id || connectionJsonDigest(document) !== row.digest) throw new Error("Invalid reviewed release identity or digest");
  for (const key of collections) if (new Set(document[key].map((item) => item.id)).size !== document[key].length) throw new Error("Duplicate public record ID");
  return document;
}

/** No prior fact prose, excerpts, URLs, artifacts or withdrawn labels leave the server. */
export function compareConnectionReleases(previous: PublicResearchDocument, current: PublicResearchDocument) {
  if ([previous.releaseId, current.releaseId].includes("legacy-documentary-catalog")) throw new Error("Documentary catalog is not a reviewed release");
  const oldClaims = new Map(previous.claims.map((claim) => [claim.id, claim]));
  const claimIds = new Set(current.claims.map((claim) => claim.id));
  const changes = current.claims.flatMap<{ id: string; label: string; change: "added" | "changed"; fields: string[] }>((claim) => {
    const old = oldClaims.get(claim.id);
    if (!old) return [{ id: claim.id, label: claim.label, change: "added" as const, fields: [] as string[] }];
    const changed: string[] = fields.filter((key) => !same(old[key], claim[key]));
    for (const key of ["evidence", "contracts"] as const) {
      const records = (doc: PublicResearchDocument) => doc[key].filter((item) => item.claimId === claim.id).sort((a, b) => a.id.localeCompare(b.id));
      if (!same(records(previous), records(current))) changed.push(key);
    }
    const linked = (doc: PublicResearchDocument) => {
      const sourceIds = new Set(doc.evidence.filter((item) => item.claimId === claim.id).map((item) => item.sourceId));
      return { entities: doc.entities.filter((item) => [claim.from, claim.to].includes(item.id)).sort((a, b) => a.id.localeCompare(b.id)), sources: doc.sources.filter((item) => sourceIds.has(item.id)).sort((a, b) => a.id.localeCompare(b.id)), revisions: doc.revisions.filter((item) => sourceIds.has(item.sourceId)).sort((a, b) => a.id.localeCompare(b.id)) };
    };
    if (!same(linked(previous), linked(current))) changed.push("linked entity / source records");
    return changed.length ? [{ id: claim.id, label: claim.label, change: "changed" as const, fields: changed }] : [];
  });
  const counts = Object.fromEntries(collections.map((key) => {
    const before = new Map<string, unknown>(previous[key].map((record) => [record.id, record]));
    const after = new Map<string, unknown>(current[key].map((record) => [record.id, record]));
    return [key, { added: [...after.keys()].filter((id) => !before.has(id)).length, removed: [...before.keys()].filter((id) => !after.has(id)).length, changed: [...after.keys()].filter((id) => before.has(id) && !same(before.get(id), after.get(id))).length }];
  })) as Record<typeof collections[number], { added: number; removed: number; changed: number }>;
  return { previous: { id: previous.releaseId, reviewedOn: previous.reviewedOn }, current: { id: current.releaseId, reviewedOn: current.reviewedOn }, changes, removedIds: previous.claims.filter((claim) => !claimIds.has(claim.id)).map((claim) => claim.id).sort(), counts };
}

export type ConnectionReleaseComparison = ReturnType<typeof compareConnectionReleases>;
export type ConnectionComparisons = { status: "available" | "disabled" | "unavailable"; comparisons: ConnectionReleaseComparison[] };
