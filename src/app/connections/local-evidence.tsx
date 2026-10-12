import type { PublicResearchDocument } from "@/lib/connection-research";
import { scopeDescriptions } from "./connection-descriptors";
import styles from "./connections.module.css";

export function LocalEvidence({ document, claims, onSelect }: { document: PublicResearchDocument; claims: PublicResearchDocument["claims"]; onSelect: (node: string, edge: string) => void }) {
  const local = claims.filter((claim) => claim.geography !== "national");
  const harrisContracts = document.contracts.some((contract) => document.claims.some((claim) => claim.id === contract.claimId && claim.geography === "county:48201"));
  return <div className={styles.timeline} aria-label="Local evidence records">
    <h2>Local records: what is actually documented?</h2>
    <p>These are source-scoped observations, not a complete jurisdiction inventory. Election dates are shown only where the record names them; a publication/observation date is not an election year. A shared county name does not join an equipment record to a media staffing plan.</p>
    <details><summary>Evidence scopes</summary><dl>{Object.entries(scopeDescriptions).map(([key, item]) => <div key={key}><dt>{item.label}</dt><dd>{item.description}</dd></div>)}</dl></details>
    {local.map((claim) => <article key={claim.id} className={styles.localRecord}>
      <button onClick={() => onSelect(claim.from, claim.id)}>{claim.label}</button>
      <p><strong>{scopeDescriptions[claim.scope].label}</strong> · {claim.geography}</p>
      <p>{claim.dated}</p><p>{claim.establishes}</p><p>{claim.limitation}</p>
      <ul>{document.evidence.filter((item) => item.claimId === claim.id).map((item) => { const source = document.sources.find((record) => record.id === item.sourceId); return source ? <li key={item.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a> · {item.locator.section}</li> : null; })}</ul>
    </article>)}
    {!local.length ? <p>No local records match these filters. Missing records do not establish non-use.</p> : null}
    <p>Executed contracts, amendments and actual spending are separate evidence. {harrisContracts ? "See the Harris County contract records for the amounts and identifiers actually established; unknown values remain unknown." : "No Harris County contract amount or award ID has been verified in this catalog."}</p>
  </div>;
}
