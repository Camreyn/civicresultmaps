import type { PublicResearchDocument } from "@/lib/connection-research";

type ClaimKind = PublicResearchDocument["claims"][number]["kind"];
type Attribution = PublicResearchDocument["evidence"][number]["attribution"];
type SourceClass = PublicResearchDocument["sources"][number]["sourceClass"];

export const relationshipDescriptions = {
  results: { label: "Election results", description: "Collection or sharing of reported vote totals, or membership in a reporting arrangement. Read the specific link for its scope; this is not election certification." },
  survey: { label: "Voter surveys", description: "Research about voters and their choices. Survey estimates are not a count of ballots." },
  ownership: { label: "Ownership", description: "Company ownership or voting interests. This is not an election-data delivery route or proof of intervention in a race call." },
  role: { label: "Positions & appointments", description: "A person's job, board position or advisory appointment. An appointment does not by itself establish ownership or operational control." },
  technology: { label: "Technology partnerships", description: "A service, system or technical partnership. Availability of a product does not establish its use by a particular election system." },
  contract: { label: "Contracts & procurement", description: "A purchasing agreement or award. An award does not by itself establish deployment, actual spending or an election-data route." },
  inventory: { label: "System inventories", description: "A system listed in a source record. A listing is not proof that it was used in a particular election." },
} satisfies Record<ClaimKind, { label: string; description: string }>;

export const evidenceDescriptions = {
  official_record: { label: "Official record", description: "A public-agency record or formal filing. Check what that particular record establishes." },
  issuer_statement: { label: "Organization's own statement", description: "An organization describes its own work or agreement. This is not independent corroboration." },
  independent_reporting: { label: "Independent reporting", description: "Reporting by a separate publisher. Its cited records and methods still matter." },
  supplemental: { label: "Background context", description: "Additional context, not sufficient on its own to establish a connection." },
} satisfies Record<Attribution, { label: string; description: string }>;

export const sourceDescriptions = {
  official: evidenceDescriptions.official_record,
  issuer: evidenceDescriptions.issuer_statement,
  independent: evidenceDescriptions.independent_reporting,
  supplemental: evidenceDescriptions.supplemental,
} satisfies Record<SourceClass, { label: string; description: string }>;

export function relationshipDescription(value: string) {
  return Object.hasOwn(relationshipDescriptions, value) ? relationshipDescriptions[value as ClaimKind] : null;
}

export function evidenceDescription(value: string) {
  return Object.hasOwn(evidenceDescriptions, value) ? evidenceDescriptions[value as Attribution] : null;
}
