import { publicationIssues, validateResearchDocument, type ResearchActor, type ResearchDocument } from "./connection-research.ts";

export type ResearchCommand =
  | { operation: "save"; document: unknown; note: string }
  | { operation: "capture"; revision: ResearchDocument["revisions"][number]; publicSourceCopy: true; note: string }
  | { operation: "review_source"; revisionId: string; decision: "approve" | "reject"; note: string }
  | { operation: "transition"; claimId: string; state: "draft" | "in_review" | "approved" | "withdrawn"; note: string }
  | { operation: "publish"; note: string }
  | { operation: "rollback"; releaseId: string; note: string };

function equal(left: unknown, right: unknown) { return JSON.stringify(left) === JSON.stringify(right); }
export function editResearchDocument(previous: ResearchDocument, command: Exclude<ResearchCommand, { operation: "rollback" }>, actor: ResearchActor, at: string): ResearchDocument {
  if (!command.note.trim()) throw new Error("A decision note is required");
  let document = structuredClone(previous);
  if (command.operation === "save") {
    document = validateResearchDocument(command.document);
    if (!equal(document.revisions, previous.revisions) || !equal(document.sourceReviews, previous.sourceReviews)) throw new Error("Source captures and decisions use their dedicated operations");
    if (previous.claims.some((claim) => !document.claims.some((item) => item.id === claim.id))) throw new Error("Use withdrawal instead of deleting claims");
    for (const source of document.sources) {
      const old = previous.sources.find((record) => record.id === source.id);
      if (source.latestRevisionId !== (old?.latestRevisionId ?? null)) throw new Error("Source revision pointers cannot be edited");
      if (old && old.url !== source.url) throw new Error("Register a new source ID for a changed URL");
    }
    for (const claim of document.claims) {
      const old = previous.claims.find((record) => record.id === claim.id);
      const meaningful = (item: typeof claim) => ({ ...item, review: null, state: "draft" });
      const oldEvidence = previous.evidence.filter((item) => item.claimId === claim.id);
      const nextEvidence = document.evidence.filter((item) => item.claimId === claim.id);
      const changed = !old || !equal(meaningful(old), meaningful(claim)) || !equal(oldEvidence, nextEvidence)
        || !equal(previous.contracts.filter((item) => item.claimId === claim.id), document.contracts.filter((item) => item.claimId === claim.id))
        || [claim.from, claim.to].some((id) => !equal(previous.entities.find((item) => item.id === id), document.entities.find((item) => item.id === id)))
        || nextEvidence.some((item) => !equal(previous.sources.find((source) => source.id === item.sourceId), document.sources.find((source) => source.id === item.sourceId)));
      if (old?.state === "withdrawn" && changed && !actor.publisher) throw new Error("Publisher required to revise a withdrawn claim");
      claim.state = changed ? "draft" : old.state;
      claim.review = changed ? null : old.review;
    }
  } else if (command.operation === "capture") {
    if (command.publicSourceCopy !== true) throw new Error("A registered public-source copy attestation is required");
    const revision = command.revision;
    const source = document.sources.find((record) => record.id === revision.sourceId);
    if (!source) throw new Error("Register the source before collecting it");
    const existing = document.revisions.find((record) => record.id === revision.id);
    if (existing && !equal(existing, revision)) throw new Error("Retained revisions are immutable");
    if (existing && source.latestRevisionId !== existing.id) throw new Error("An older revision cannot replace the latest captured source");
    if (!existing) document.revisions.push(revision);
    source.latestRevisionId = revision.id;
  } else if (command.operation === "review_source") {
    if (!actor.publisher) throw new Error("Publisher review required");
    const revision = document.revisions.find((record) => record.id === command.revisionId);
    if (!revision) throw new Error("Unknown retained revision");
    document.sourceReviews.push({ sourceId: revision.sourceId, revisionId: revision.id, decision: command.decision, by: actor.id, at, note: command.note });
  } else if (command.operation === "transition") {
    const claim = document.claims.find((record) => record.id === command.claimId);
    if (!claim) throw new Error("Unknown claim");
    if (command.state === "approved") {
      if (!actor.publisher || claim.state !== "in_review") throw new Error("Publisher approval requires an in-review claim");
      claim.review = { by: actor.id, at, note: command.note, neutralLanguage: true };
      const issues = publicationIssues(document, claim);
      if (issues.length) throw new Error(issues.join("; "));
    } else if (command.state === "in_review" && claim.state !== "draft") {
      throw new Error("Only drafts can enter review");
    } else if (command.state === "draft" && !["draft", "in_review"].includes(claim.state) && !actor.publisher) {
      throw new Error("Publisher required to reopen an approved, published or withdrawn claim");
    } else if (command.state === "withdrawn" && !actor.publisher) {
      throw new Error("Publisher withdrawal required");
    }
    claim.state = command.state;
    if (command.state === "draft") claim.review = null;
  } else if (command.operation === "publish") {
    if (!actor.publisher) throw new Error("Publisher required");
    for (const claim of document.claims) if (claim.state === "approved") claim.state = "published";
    if (!document.claims.some((claim) => claim.state === "published")) throw new Error("No reviewed claims to publish");
    document.reviewedOn = at.slice(0, 10);
  }
  return validateResearchDocument(document);
}
