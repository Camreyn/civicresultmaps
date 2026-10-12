"use client";
import { useState } from "react";
import { recordsRequestDraft, publicationIssues, type ResearchDocument, type ResearchClaim } from "@/lib/connection-research";
import type { ResearchCommand } from "@/lib/connection-research-policy";
import styles from "./research.module.css";
import { SourceComparison } from "./source-comparison";

type Workspace = { version: number; document: ResearchDocument };
type Tab = "claims" | "sources" | "entities" | "evidence" | "contracts" | "questions";
function download(value: unknown, name: string, plain = false) {
  const url = URL.createObjectURL(new Blob([plain ? String(value) : JSON.stringify(value, null, 2)], { type: plain ? "text/plain" : "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ResearchEditor({ initial, publisher }: { initial: Workspace; publisher: boolean }) {
  const [workspace, setWorkspace] = useState(initial);
  const [draft, setDraft] = useState(initial.document);
  const [tab, setTab] = useState<Tab>("claims");
  const [selected, setSelected] = useState(initial.document.claims[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [publicCopy, setPublicCopy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(workspace.document);
  const item = draft[tab].find((record) => record.id === selected);
  async function operation(command: ResearchCommand) {
    if (!note.trim()) { setMessage("Enter a decision note first."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...command, expectedVersion: workspace.version, note }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Research operation failed");
      setWorkspace(result); setDraft(result.document); setNote(""); setConfirmed(false); setMessage("Saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Research operation failed"); }
    finally { setBusy(false); }
  }
  function update(field: string, value: unknown) {
    setDraft((current) => ({ ...current, [tab]: current[tab].map((record) => record.id === selected ? { ...record, [field]: value } : record) }));
  }
  function add() {
    const id = `${tab.slice(0, -1)}-${crypto.randomUUID()}`;
    const entity = draft.entities[0]?.id ?? "";
    const claim = draft.claims[0]?.id ?? "";
    const source = draft.sources[0]?.id ?? "";
    const records = {
      entities: { id, label: "New entity", category: "Organization", description: "Describe the entity.", geography: "national", identifiers: {} },
      sources: { id, title: "New source", authority: "Source authority", url: "https://example.org/", sourceClass: "official", publishedOn: null, eventOn: null, latestRevisionId: null, legacyCheck: null },
      claims: { id, from: entity, to: entity, label: "New relationship", kind: "technology", view: "technology", geography: "national", establishes: "What the source establishes.", limitation: "What the source does not establish.", dated: "Date not established", observedOn: null, effectiveFrom: null, effectiveTo: null, scope: "documented", state: "draft", review: null, ownership: null },
      evidence: { id, claimId: claim, sourceId: source, revisionId: null, relation: "supports", locator: { page: null, section: "Exact section", pointer: null }, excerpt: "", attribution: "official_record" },
      contracts: { id, claimId: claim, awardId: "Award identifier", buyer: entity, supplier: entity, scope: "Contract scope", currency: "USD", ceiling: null, obligated: null, spent: null, signedOn: null, startsOn: null, endsOn: null, amendment: "" },
      questions: { id, title: "New question", question: "Research question", needed: "Evidence needed", sourceIds: [], status: "open", geography: "national", public: false, finding: "", resolutionClaimIds: [], searchHistory: [], owner: "", workingNotes: "", custodian: { name: "", url: null, routingVerifiedOn: null } },
    };
    setDraft((current) => ({ ...current, [tab]: [...current[tab], records[tab]] } as ResearchDocument)); setSelected(id);
  }
  function field(label: string, key: string, value: string | null, multiline = false) {
    return <label className={styles.field} key={key}>{label}{multiline ? <textarea value={value ?? ""} onChange={(event) => update(key, event.target.value)} /> : <input value={value ?? ""} type={/On$|From$|To$/.test(key) ? "date" : "text"} onChange={(event) => update(key, event.target.value || (/On$|From$|To$/.test(key) ? null : ""))} />}</label>;
  }
  function choice(label: string, key: string, value: string | null, options: Array<{ id: string; label: string }>, nullable = false) {
    return <label className={styles.field} key={key}>{label}<select value={value ?? ""} onChange={(event) => update(key, event.target.value || null)}>{nullable ? <option value="">Not selected</option> : null}{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>;
  }
  const options = (values: string[]) => values.map((id) => ({ id, label: id.replaceAll("_", " ") }));
  return <main className={styles.shell}>
    <header><h1>Connections research</h1><a href="/connections">Public explorer</a><span>Revision {workspace.version}</span></header>
    <div className={styles.toolbar}><button disabled={busy} onClick={() => operation({ operation: "save", document: draft, note })}>Save draft</button><button disabled={dirty || busy} onClick={() => download(workspace.document, "connections-private-workspace.json")}>Export private workspace</button><label>Decision note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="What changed or was reviewed?" /></label></div>
    <p role="status">{message || (dirty ? "Unsaved changes" : "")}</p>
    <div className={styles.grid}><aside><nav aria-label="Research record types">{(["claims", "sources", "entities", "evidence", "contracts", "questions"] as Tab[]).map((value) => <button key={value} aria-pressed={tab === value} onClick={() => { setTab(value); setSelected(draft[value][0]?.id ?? ""); }}>{value}</button>)}</nav><button onClick={add}>Add record</button><div className={styles.list}>{draft[tab].map((record) => <button key={record.id} aria-pressed={selected === record.id} onClick={() => setSelected(record.id)}>{"label" in record ? record.label : "title" in record ? record.title : record.id}</button>)}</div></aside>
    <section className={styles.form} aria-label="Selected research record">
      {!item ? <p>No records in this section.</p> : <><p className={styles.identifier}>{item.id}</p>
        {tab === "entities" && "description" in item ? <>{field("Name", "label", item.label)}{field("Category", "category", item.category)}{field("Description", "description", item.description, true)}{field("Geography", "geography", item.geography)}<label className={styles.field}>Official identifiers<textarea value={Object.entries(item.identifiers).map(([key, value]) => `${key}=${value}`).join("\n")} onChange={(event) => update("identifiers", Object.fromEntries(event.target.value.split("\n").filter((line) => line.includes("=")).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])))} /></label></> : null}
        {tab === "claims" && "establishes" in item ? <>
          {field("Relationship", "label", item.label)}{choice("From", "from", item.from, draft.entities)}{choice("To", "to", item.to, draft.entities)}
          {choice("Type", "kind", item.kind, options(["results", "survey", "ownership", "role", "technology", "contract", "inventory"]))}{choice("View", "view", item.view, options(["reporting", "ownership", "technology"]))}
          {field("Geography", "geography", item.geography)}{field("Evidence establishes", "establishes", item.establishes, true)}{field("Evidence limits", "limitation", item.limitation, true)}{field("Date context", "dated", item.dated)}{field("Observation date", "observedOn", item.observedOn)}{field("Effective start", "effectiveFrom", item.effectiveFrom)}{field("Effective end", "effectiveTo", item.effectiveTo)}{choice("Assertion scope", "scope", item.scope, options(["documented", "certified", "procured", "fielded"]))}
          <label><input type="checkbox" checked={item.ownership !== null} onChange={(event) => update("ownership", event.target.checked ? { economicPct: null, votingPct: null } : null)} />Record ownership interests</label>
          {item.ownership ? (["economicPct", "votingPct"] as const).map((key) => <label className={styles.field} key={key}>{key === "economicPct" ? "Economic interest (%)" : "Voting interest (%)"}<input type="number" min="0" max="100" value={item.ownership?.[key] ?? ""} onChange={(event) => update("ownership", { ...item.ownership, [key]: event.target.value === "" ? null : Number(event.target.value) })} /></label>) : null}
          <p>Review state: {item.state}</p><ul>{publicationIssues(draft, item as ResearchClaim).map((issue) => <li key={issue}>{issue}</li>)}</ul>
          <div className={styles.toolbar}><button disabled={dirty || busy || item.state !== "draft"} onClick={() => operation({ operation: "transition", claimId: item.id, state: "in_review", note })}>Submit for review</button><button disabled={dirty || busy} onClick={() => operation({ operation: "transition", claimId: item.id, state: "draft", note })}>Return to draft</button>{publisher ? <><button disabled={dirty || busy || !confirmed || item.state !== "in_review"} onClick={() => operation({ operation: "transition", claimId: item.id, state: "approved", note })}>Approve</button><button disabled={dirty || busy} onClick={() => operation({ operation: "transition", claimId: item.id, state: "withdrawn", note })}>Withdraw</button></> : null}</div>
        </> : null}
        {tab === "sources" && "authority" in item ? <>
          {field("Title", "title", item.title)}{field("Authority", "authority", item.authority)}{field("Original public URL", "url", item.url)}{choice("Source classification", "sourceClass", item.sourceClass, options(["official", "issuer", "independent", "supplemental"]))}{field("Publication date", "publishedOn", item.publishedOn)}{field("Event date", "eventOn", item.eventOn)}
          {item.legacyCheck ? <details><summary>Earlier content check</summary><p>{item.legacyCheck.locator}</p><p>{item.legacyCheck.note}</p></details> : null}
          <SourceComparison key={`${item.id}-${draft.revisions.length}`} revisions={draft.revisions.filter((revision) => revision.sourceId === item.id)} />
          <label className={styles.field}>Import collected source revision<input type="file" accept="application/json,.json" disabled={dirty || busy || !publicCopy || !note.trim()} onChange={async (event) => { const file = event.target.files?.[0]; if (!file || file.size > 100000) return; try { const revision = JSON.parse(await file.text()); await operation({ operation: "capture", revision, publicSourceCopy: true, note }); setPublicCopy(false); } catch { setMessage("Invalid collected revision file."); } event.target.value = ""; }} /></label>
          <label><input type="checkbox" checked={publicCopy} onChange={(event) => setPublicCopy(event.target.checked)} />This is a copy of the registered public source, not private correspondence or nonpublic records.</label>
          <label className={styles.field}>Retain public-source copy privately (up to 3 MiB)<input type="file" accept="application/pdf,text/html,text/plain,application/json,.pdf,.html,.txt,.json" disabled={dirty || busy || !publicCopy || !note.trim()} onChange={async (event) => {
            const file = event.target.files?.[0]; if (!file) return;
            setBusy(true); setMessage("");
            try {
              const form = new FormData(); form.set("file", file); form.set("sourceId", item.id); form.set("note", note); form.set("expectedVersion", String(workspace.version)); form.set("publicSourceCopy", "1");
              const response = await fetch("/api/admin/connections/captures", { method: "POST", body: form }); const result = await response.json();
              if (!response.ok) throw new Error(result.error); setWorkspace(result); setDraft(result.document); setNote(""); setPublicCopy(false); setMessage("Source copy retained; review pending.");
            } catch (error) { setMessage(error instanceof Error ? error.message : "Source capture failed."); } finally { setBusy(false); event.target.value = ""; }
          }} /></label>
          {draft.revisions.filter((revision) => revision.sourceId === item.id).map((revision) => <article key={revision.id}><p>{revision.retrievedAt} · {revision.completeness}</p><code>{revision.sha256}</code><p><a href={`/api/admin/connections/artifacts/${revision.id}`}>Download private retained copy</a></p><p>{draft.sourceReviews.filter((decision) => decision.revisionId === revision.id).at(-1)?.decision ?? "Review pending"}</p>{publisher ? <div className={styles.toolbar}><button disabled={dirty || busy || !confirmed} onClick={() => operation({ operation: "review_source", revisionId: revision.id, decision: "approve", note })}>Approve source revision</button><button disabled={dirty || busy} onClick={() => operation({ operation: "review_source", revisionId: revision.id, decision: "reject", note })}>Reject source revision</button></div> : null}</article>)}
        </> : null}
        {tab === "evidence" && "locator" in item ? <>
          {choice("Claim", "claimId", item.claimId, draft.claims)}{choice("Source", "sourceId", item.sourceId, draft.sources.map((source) => ({ id: source.id, label: source.title })))}{choice("Retained revision", "revisionId", item.revisionId, draft.revisions.filter((revision) => revision.sourceId === item.sourceId).map((revision) => ({ id: revision.id, label: `${revision.retrievedAt} · ${revision.sha256.slice(0, 12)}` })), true)}{choice("Evidence relation", "relation", item.relation, options(["supports", "contradicts", "context"]))}{choice("Attribution", "attribution", item.attribution, options(["official_record", "issuer_statement", "independent_reporting", "supplemental"]))}
          <label className={styles.field}>Page<input type="number" min="1" value={item.locator.page ?? ""} onChange={(event) => update("locator", { ...item.locator, page: event.target.value ? Number(event.target.value) : null })} /></label><label className={styles.field}>Exact section<input value={item.locator.section} onChange={(event) => update("locator", { ...item.locator, section: event.target.value })} /></label><label className={styles.field}>Data pointer<input value={item.locator.pointer ?? ""} onChange={(event) => update("locator", { ...item.locator, pointer: event.target.value || null })} /></label>{field("Short reviewed passage", "excerpt", item.excerpt, true)}
        </> : null}
        {tab === "contracts" && "awardId" in item ? <>
          {choice("Contract relationship", "claimId", item.claimId, draft.claims.filter((claim) => claim.kind === "contract"))}{field("Award identifier", "awardId", item.awardId)}{choice("Buyer", "buyer", item.buyer, draft.entities)}{choice("Supplier", "supplier", item.supplier, draft.entities)}{field("Scope", "scope", item.scope, true)}{field("Signed", "signedOn", item.signedOn)}{field("Starts", "startsOn", item.startsOn)}{field("Ends", "endsOn", item.endsOn)}{field("Amendment", "amendment", item.amendment, true)}{(["ceiling", "obligated", "spent"] as const).map((key) => <label className={styles.field} key={key}>{key} (USD)<input type="number" min="0" value={item[key] ?? ""} onChange={(event) => update(key, event.target.value === "" ? null : Number(event.target.value))} /></label>)}
        </> : null}
        {tab === "questions" && "question" in item ? <>
          {field("Title", "title", item.title)}{field("Question", "question", item.question, true)}{field("Evidence needed", "needed", item.needed, true)}{field("Geography", "geography", item.geography)}{choice("Status", "status", item.status, options(["open", "researching", "awaiting_records", "documented", "contradicted", "inconclusive"]))}{field("Public finding", "finding", item.finding, true)}{field("Private assignee", "owner", item.owner)}{field("Private working notes", "workingNotes", item.workingNotes, true)}
          <label><input type="checkbox" checked={item.public} onChange={(event) => update("public", event.target.checked)} />Include question in next reviewed release</label>
          <label className={styles.field}>Sources<select multiple value={item.sourceIds} onChange={(event) => update("sourceIds", [...event.target.selectedOptions].map((option) => option.value))}>{draft.sources.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>
          <label className={styles.field}>Relationships supporting the public finding<select multiple value={item.resolutionClaimIds} onChange={(event) => update("resolutionClaimIds", [...event.target.selectedOptions].map((option) => option.value))}>{draft.claims.map((claim) => <option key={claim.id} value={claim.id}>{claim.label} · {claim.state}</option>)}</select></label>
          <label className={styles.field}>Custodian<input value={item.custodian.name} onChange={(event) => update("custodian", { ...item.custodian, name: event.target.value })} /></label><label className={styles.field}>Custodian routing source<input value={item.custodian.url ?? ""} onChange={(event) => update("custodian", { ...item.custodian, url: event.target.value || null })} /></label><label className={styles.field}>Routing verified<input type="date" value={item.custodian.routingVerifiedOn ?? ""} onChange={(event) => update("custodian", { ...item.custodian, routingVerifiedOn: event.target.value || null })} /></label>
          <button onClick={() => download(recordsRequestDraft(item), `${item.id}-request-draft.txt`, true)}>Download request draft</button>
          <h2>Search history</h2>{item.searchHistory.map((entry, index) => <fieldset key={index}><input type="date" aria-label="Search date" value={entry.date} onChange={(event) => update("searchHistory", item.searchHistory.map((record, i) => i === index ? { ...record, date: event.target.value } : record))} /><input aria-label="Search query" value={entry.query} onChange={(event) => update("searchHistory", item.searchHistory.map((record, i) => i === index ? { ...record, query: event.target.value } : record))} /><textarea aria-label="Search outcome" value={entry.outcome} onChange={(event) => update("searchHistory", item.searchHistory.map((record, i) => i === index ? { ...record, outcome: event.target.value } : record))} /></fieldset>)}<button onClick={() => update("searchHistory", [...item.searchHistory, { date: new Date().toISOString().slice(0, 10), query: "Search terms", outcome: "Result or gap" }])}>Add search</button>
        </> : null}
      </>}
    </section></div>
    {publisher ? <footer><label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed the supporting passages, dates, scope, and neutral wording.</label><button disabled={dirty || busy || !confirmed} onClick={() => operation({ operation: "publish", note })}>Publish reviewed release</button><label>Previous public release ID<input id="research-rollback" /></label><button disabled={dirty || busy || !confirmed} onClick={() => { const releaseId = (document.getElementById("research-rollback") as HTMLInputElement).value; operation({ operation: "rollback", releaseId, note }); }}>Restore public release only</button></footer> : null}
  </main>;
}
