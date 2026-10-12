import { connectionEdges, connectionNodes, connectionSources, connectionsReviewedOn, researchLeads } from "./election-connections.ts";
import { validateResearchDocument, type ResearchDocument } from "./connection-research.ts";

/** Migration is deliberately draft-only. Reading a URL is not archival verification. */
export function initialResearchDocument(): ResearchDocument {
  const document: ResearchDocument = {
    schemaVersion: 2, reviewedOn: connectionsReviewedOn,
    entities: connectionNodes.map((node) => ({ ...node, geography: ["txsos", "county", "team", "civix"].includes(node.id) ? "TX" : "national", identifiers: {} })),
    sources: connectionSources.map((source) => ({
      id: source.id, authority: source.authority, title: source.title, url: source.url,
      sourceClass: /Secretary of State|DHS/.test(source.authority) ? "official" : "issuer",
      publishedOn: source.publishedOn ?? null, eventOn: source.eventOn ?? null, latestRevisionId: null,
      legacyCheck: { checkedOn: source.review.checkedOn, locator: source.review.locator, note: source.review.note },
    })),
    revisions: [], sourceReviews: [], contracts: [],
    claims: connectionEdges.map((edge) => ({
      id: edge.id, from: edge.from, to: edge.to, label: edge.label, kind: edge.kind, view: edge.view,
      geography: edge.view === "technology" && [edge.from, edge.to].some((id) => ["team", "county", "txsos", "civix"].includes(id)) ? "TX" : "national",
      establishes: edge.establishes, limitation: edge.limitation, dated: edge.dated,
      observedOn: null, effectiveFrom: null, effectiveTo: null,
      scope: "documented", state: "draft", review: null, ownership: null,
    })),
    evidence: connectionEdges.flatMap((edge) => edge.sourceIds.map((sourceId) => {
      const source = connectionSources.find((record) => record.id === sourceId)!;
      return {
        id: `${edge.id}-${sourceId}`, claimId: edge.id, sourceId, revisionId: null,
        relation: "supports" as const,
        locator: { page: null, section: source.review.locator, pointer: null }, excerpt: "",
        attribution: /Secretary of State|DHS/.test(source.authority) ? "official_record" as const : "issuer_statement" as const,
      };
    })),
    questions: researchLeads.map((lead) => ({
      ...lead, status: "open", geography: /TEAM|Texas|SAVE/.test(lead.title) ? "TX" : "national",
      public: true, finding: "", resolutionClaimIds: [], searchHistory: [], owner: "", workingNotes: "",
      custodian: { name: "", url: null, routingVerifiedOn: null },
    })),
  };
  document.sources.push({
    id: "tx-systems-2026", authority: "Texas Secretary of State", title: "Voting Systems by County 2026",
    url: "https://www.sos.texas.gov/elections/forms/sysexam/voting-sys-bycounty.pdf",
    sourceClass: "official", publishedOn: "2026-09-01", eventOn: null, latestRevisionId: null,
    legacyCheck: { checkedOn: "2026-10-11", locator: "PDF pages 1, 15 and 32; revised September 1, 2026", note: "Official county inventory; election-specific installation/use is not established." },
  });
  document.sources.push({
    id: "tx-2024-official-county-results", authority: "Texas Secretary of State", title: "2024 county presidential result package",
    url: "https://results.texas-election.com/static/data/election/49664/1012/County.json", sourceClass: "official",
    publishedOn: null, eventOn: "2024-11-05", latestRevisionId: null, legacyCheck: null,
  });
  document.entities.push({ id: "oracle-america", label: "Oracle America", category: "Named award recipient", description: "Recipient named in the DHS Cumulus award notice; keep the legal contracting entity distinct from product and parent-company nodes.", geography: "national", identifiers: {} });
  document.claims.push({ id: "dhs-cumulus-contract", from: "dhs", to: "oracle-america", label: "Cumulus cloud award", kind: "contract", view: "technology", geography: "national", establishes: "The DHS award notice names Oracle America as the recipient of award 70RTAC26D00000005 for department-wide Cumulus commercial cloud services.", limitation: "Department-wide contract scope does not establish use by SAVE, a specific database engine, Texas TEAM deployment, or actual expenditure.", dated: "Award notice dated August 10, 2026", observedOn: "2026-08-10", effectiveFrom: null, effectiveTo: null, scope: "procured", state: "draft", review: null, ownership: null });
  document.evidence.push({ id: "dhs-cumulus-contract-notice", claimId: "dhs-cumulus-contract", sourceId: "dhs-oracle", revisionId: null, relation: "supports", locator: { page: null, section: "SAM.gov Award Details and Description", pointer: null }, excerpt: "", attribution: "official_record" });
  document.contracts.push({ id: "dhs-cumulus-award", claimId: "dhs-cumulus-contract", awardId: "70RTAC26D00000005", buyer: "dhs", supplier: "oracle-america", scope: "Department-wide Cumulus commercial cloud services; SAVE-specific architecture not established", currency: "USD", ceiling: null, obligated: null, spent: null, signedOn: null, startsOn: null, endsOn: null, amendment: "Amounts, performance period and amendments require review of the executed award record." });
  document.questions.push({ id: "tx-result-lineage", title: "Texas 2024 county result lineage", question: "Does each displayed county candidate value trace to the reviewed official County.json revision and a recorded import?", needed: "Retained official County.json, exact candidate pointers, staging and parser/config hashes, matching import run, stable API revision and browser delivery checks.", sourceIds: ["tx-2024-official-county-results"], status: "open", geography: "TX", public: false, finding: "", resolutionClaimIds: [], owner: "", workingNotes: "", searchHistory: [], custodian: { name: "", url: null, routingVerifiedOn: null } });
  const pilots = [
    { id: "anderson-tx", name: "Anderson", fips: "48001", system: "ES&S EVS 6.1.1.0", equipment: "DS200, DS450 and ExpressVote", page: 1 },
    { id: "harris-tx", name: "Harris", fips: "48201", system: "Hart Verity 2.7", equipment: "Verity Duo, Controller, Scan and Central", page: 15 },
    { id: "travis-tx", name: "Travis", fips: "48453", system: "ES&S EVS 6.3.0.0", equipment: "ExpressVote, DS200, DS450, DS850 and DS950", page: 32 },
  ];
  for (const pilot of pilots) {
    const systemId = `${pilot.id}-system`;
    document.entities.push({ id: pilot.id, label: `${pilot.name} County`, category: "County", description: "Texas county research pilot.", geography: `county:${pilot.fips}`, identifiers: { countyFips: pilot.fips } });
    document.entities.push({ id: systemId, label: pilot.system, category: "Documented inventory", description: pilot.equipment, geography: `county:${pilot.fips}`, identifiers: {} });
    const claimId = `${pilot.id}-inventory`;
    document.claims.push({
      id: claimId, from: pilot.id, to: systemId, label: "Listed in September 2026 inventory", kind: "inventory", view: "technology",
      geography: `county:${pilot.fips}`, establishes: `The Texas SOS inventory lists ${pilot.system} and ${pilot.equipment} for ${pilot.name} County.`,
      limitation: "Inventory entry only; does not establish use in the 2024 election, site installation, enabled connections, or actual software execution.",
      dated: "Inventory revised September 1, 2026", observedOn: "2026-09-01", effectiveFrom: null, effectiveTo: null,
      scope: "documented", state: "draft", review: null, ownership: null,
    });
    document.evidence.push({ id: `${claimId}-source`, claimId, sourceId: "tx-systems-2026", revisionId: null, relation: "supports", locator: { page: pilot.page, section: `${pilot.name} County inventory entry`, pointer: null }, excerpt: "", attribution: "official_record" });
    document.questions.push({
      id: `${pilot.id}-deployment`, title: `${pilot.name} County: deployment and contracts`, geography: `county:${pilot.fips}`,
      question: "Which systems, versions and services were used for the November 5, 2024 election?",
      needed: "Dated 2024 equipment inventories, executed procurement contracts and amendments, acceptance records, testing records, and election-night reporting procedures. Omit operational credentials and network addresses.",
      sourceIds: ["tx-systems-2026"], status: "open", public: false, finding: "", resolutionClaimIds: [], owner: "", workingNotes: "", searchHistory: [],
      custodian: { name: "", url: null, routingVerifiedOn: null },
    });
  }
  return validateResearchDocument(document);
}
