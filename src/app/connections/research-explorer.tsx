"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { connectionEdges } from "@/lib/election-connections";
import { connectionPath, matchesClaimDate, type PublicResearchDocument } from "@/lib/connection-research";
import { savedConnectionViews, type SavedConnectionView } from "@/lib/connection-saved-views";
import type { CanvasPositions } from "./connection-canvas";
import styles from "./connections.module.css";

const Canvas = dynamic(() => import("./connection-canvas").then((module) => module.ConnectionCanvas), { ssr: false, loading: () => <p className={styles.canvasLoading}>Loading map…</p> });
const views = [{ id: "reporting", label: "Reporting & surveys" }, { id: "ownership", label: "Ownership & roles" }, { id: "technology", label: "Technology & public systems" }] as const;
type View = typeof views[number]["id"];
export function ResearchExplorer({ document }: { document: PublicResearchDocument }) {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("reporting");
  const [asOf, setAsOf] = useState(document.reviewedOn);
  const [dateMode, setDateMode] = useState<"documented" | "active">("documented");
  const [kind, setKind] = useState("all");
  const [geography, setGeography] = useState("all");
  const [attribution, setAttribution] = useState("all");
  const searchRef = useRef<HTMLInputElement>(null);
  const [undated, setUndated] = useState(true);
  const [nodeId, setNodeId] = useState("ap");
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [panel, setPanel] = useState("graph");
  const [pinned, setPinned] = useState<string[]>([]);
  const [positions, setPositions] = useState<CanvasPositions>({});
  const [saved, setSaved] = useState<SavedConnectionView[]>([]);
  const [saveName, setSaveName] = useState("");
  const [notice, setNotice] = useState("");
  const [pathTo, setPathTo] = useState("");
  const [dataRoute, setDataRoute] = useState(false);
  const legacy = document.releaseId === "legacy-documentary-catalog";
  useEffect(() => {
    function restore() {
      const params = new URLSearchParams(window.location.search);
      const restoredView = views.find((item) => item.id === params.get("view"))?.id ?? "reporting";
      setView(restoredView);
      const requestedDate = params.get("asOf") ?? (params.get("year") === "2024" ? "2024-11-05" : document.reviewedOn);
      setAsOf(/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && requestedDate <= document.reviewedOn ? requestedDate : document.reviewedOn);
      setDateMode(params.get("dateMode") === "active" ? "active" : "documented");
      setKind(params.get("kind") ?? "all"); setGeography(params.get("geography") ?? "all");
      setAttribution(params.get("attribution") ?? "all");
      const edge = document.claims.find((item) => item.id === params.get("edge"));
      const preferred = { reporting: "ap", ownership: "paramount", technology: "team" }[restoredView];
      setNodeId(edge?.from ?? (document.entities.some((item) => item.id === params.get("node")) ? params.get("node")! : document.entities.some((item) => item.id === preferred) ? preferred : document.entities[0]?.id ?? ""));
      setEdgeId(edge?.id ?? null); setFocused(params.get("focus") === "1"); setUndated(params.get("undated") !== "0");
      setPathTo(params.get("to") ?? ""); setDataRoute(params.get("pathMode") === "data");
      if (params.get("release") && params.get("release") !== document.releaseId) setNotice("This saved view refers to an earlier release; showing the current reviewed data.");
    }
    restore();
    try {
      setSaved(savedConnectionViews(localStorage.getItem("crm-connections-views-v2")));
    } catch { /* Browser storage is optional. */ }
    setReady(true); window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [document]);
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams({ view, asOf, dateMode, node: nodeId, kind, geography, undated: undated ? "1" : "0", release: document.releaseId });
    params.set("attribution", attribution);
    if (edgeId) params.set("edge", edgeId);
    if (focused) params.set("focus", "1");
    if (pathTo) { params.set("to", pathTo); params.set("pathMode", dataRoute ? "data" : "connections"); }
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [ready, view, asOf, dateMode, nodeId, edgeId, kind, geography, attribution, undated, focused, document.releaseId, pathTo, dataRoute]);
  const filtered = useMemo(() => document.claims.filter((claim) => {
    if (claim.view !== view || (kind !== "all" && claim.kind !== kind) || (geography !== "all" && claim.geography !== geography)) return false;
    if (attribution !== "all" && !document.evidence.some((item) => item.claimId === claim.id && item.attribution === attribution)) return false;
    if (legacy && !connectionEdges.find((edge) => edge.id === claim.id)?.snapshots.includes(asOf <= "2024-12-31" ? "2024" : "2026")) return false;
    return matchesClaimDate(claim, asOf, dateMode) || (dateMode === "documented" && undated && !claim.observedOn);
  }), [document, view, kind, geography, attribution, asOf, dateMode, undated, legacy]);
  const claims = focused ? filtered.filter((claim) => claim.from === nodeId || claim.to === nodeId) : filtered;
  const activeIds = new Set(claims.flatMap((claim) => [claim.from, claim.to]));
  const entities = document.entities.filter((entity) => activeIds.has(entity.id));
  const selected = filtered.find((claim) => claim.id === edgeId);
  const entity = document.entities.find((item) => item.id === nodeId);
  const related = filtered.filter((claim) => claim.from === nodeId || claim.to === nodeId);
  const evidence = document.evidence.filter((item) => selected ? item.claimId === selected.id : related.some((claim) => claim.id === item.claimId));
  const path = pathTo ? connectionPath(filtered, nodeId, pathTo, dataRoute) : [];
  const select = useCallback((node: string, edge?: string) => { setNodeId(node); setEdgeId(edge ?? null); setQuery(""); }, []);
  function findNode(id: string) {
    const claim = document.claims.find((item) => item.from === id || item.to === id);
    if (claim) { setView(claim.view); setKind("all"); setGeography("all"); setAttribution("all"); setAsOf(document.reviewedOn); setDateMode("documented"); setUndated(true); setFocused(false); }
    select(id);
    searchRef.current?.focus();
  }
  function save() {
    if (!saveName.trim()) return;
    const next = [...saved.filter((item) => item.name !== saveName.trim()), { name: saveName.trim().slice(0, 80), url: window.location.pathname + window.location.search, releaseId: document.releaseId, positions, pinned }].slice(-20);
    try { localStorage.setItem("crm-connections-views-v2", JSON.stringify(next)); setSaved(next); setSaveName(""); setNotice("View saved in this browser."); } catch { setNotice("Browser storage is unavailable."); }
  }
  function load(item: SavedConnectionView) {
    let url: URL;
    try { url = new URL(item.url, window.location.origin); } catch { setNotice("Saved view address is invalid."); return; }
    if (url.origin !== window.location.origin || url.pathname !== "/connections") return;
    window.history.pushState(null, "", url); window.dispatchEvent(new PopStateEvent("popstate"));
    const ids = new Set(document.entities.map((entity) => entity.id));
    setPinned(item.pinned.filter((id) => ids.has(id))); setPositions(Object.fromEntries(Object.entries(item.positions).filter(([id]) => ids.has(id))));
  }
  function download() {
    const payload = { ...document, sourceBasis: legacy ? "Existing documentary content checks; retained revisions not yet available" : "Reviewed immutable release" };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = window.document.createElement("a"); a.href = url; a.download = "election-connections-evidence.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className={styles.explorer} aria-label="Election connections explorer">
    <div className={styles.toolbar}><div className={styles.viewButtons} role="group" aria-label="Connection perspective">{views.map((item) => <button key={item.id} aria-pressed={view === item.id} onClick={() => { setView(item.id); setEdgeId(null); setFocused(false); if (!document.claims.some((claim) => claim.view === item.id && [claim.from, claim.to].includes(nodeId))) setNodeId({ reporting: "ap", ownership: "paramount", technology: "team" }[item.id]); }}>{item.label}</button>)}</div><button className={styles.download} onClick={download}>↓ Download evidence</button></div>
    <div className={styles.filters}>
      <label>Date<input type="date" aria-label="Evidence date" max={document.reviewedOn} disabled={!ready} value={asOf} onChange={(event) => { if (event.target.value) setAsOf(event.target.value > document.reviewedOn ? document.reviewedOn : event.target.value); }} /></label>
      <label>Time filter<select value={dateMode} onChange={(event) => setDateMode(event.target.value as "documented" | "active")}><option value="documented">Documented by</option><option value="active">Known active on</option></select></label>
      <label>Relationship<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">All types</option>{[...new Set(document.claims.map((claim) => claim.kind))].sort().map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Geography<select value={geography} onChange={(event) => setGeography(event.target.value)}><option value="all">All areas</option>{[...new Set(document.claims.map((claim) => claim.geography))].sort().map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Evidence classification<select aria-label="Evidence classification" value={attribution} onChange={(event) => setAttribution(event.target.value)}><option value="all">All classifications</option>{["official_record", "issuer_statement", "independent_reporting", "supplemental"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
      <label><input type="checkbox" checked={undated} disabled={dateMode === "active"} onChange={(event) => setUndated(event.target.checked)} />Include undated records</label>
    </div>
    <div className={styles.workbench}><div className={styles.mapPanel}>
      <div className={styles.mapControls}><div className={styles.searchWrap}><label className={styles.srOnly} htmlFor="connection-search">Find an organization or person</label><input ref={searchRef} id="connection-search" type="search" disabled={!ready} placeholder="Find an organization or person…" value={query} onChange={(event) => setQuery(event.target.value)} />{query.trim() ? <div className={styles.searchResults}>{document.entities.filter((item) => `${item.label} ${item.category}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8).map((item) => <button key={item.id} onClick={() => findNode(item.id)}>{item.label}<small>{item.category}</small></button>)}</div> : null}</div><div className={styles.viewButtons}>{["graph", "timeline", "contracts"].map((value) => <button key={value} aria-pressed={panel === value} onClick={() => setPanel(value)}>{value}</button>)}</div></div>
      {panel === "graph" ? <Canvas entities={entities} claims={claims} selectedNode={nodeId} selectedEdge={edgeId} view={view} pinned={pinned} positions={positions} onSelect={select} onPosition={(id, position) => setPositions((current) => ({ ...current, [id]: position }))} /> : null}
      {panel === "timeline" ? <div className={styles.timeline}><ol>{[...claims].filter((claim) => claim.observedOn).sort((a, b) => a.observedOn!.localeCompare(b.observedOn!)).map((claim) => <li key={claim.id}><button onClick={() => select(claim.from, claim.id)}><time>{claim.observedOn}</time> {claim.label}</button><p>{claim.dated}</p>{legacy ? <small>Supporting document publication date; not an effective date.</small> : null}</li>)}</ol><details><summary>Date not established ({claims.filter((claim) => !claim.observedOn).length})</summary>{claims.filter((claim) => !claim.observedOn).map((claim) => <p key={claim.id}><button onClick={() => select(claim.from, claim.id)}>{claim.label}</button></p>)}</details></div> : null}
      {panel === "contracts" ? <div className={styles.timeline}>{document.contracts.filter((contract) => claims.some((claim) => claim.id === contract.claimId)).map((contract) => <article key={contract.id}><button onClick={() => select(contract.buyer, contract.claimId)}>{contract.awardId}</button><p>{contract.scope}</p><dl>{(["ceiling", "obligated", "spent"] as const).map((key) => <div key={key}><dt>{key}</dt><dd>{contract[key] === null ? "Not established" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(contract[key])}</dd></div>)}</dl><p>Start {contract.startsOn ?? "unknown"} · End {contract.endsOn ?? "unknown"}</p></article>)}{!document.contracts.length ? <p>No reviewed contract amounts in this catalog.</p> : null}</div> : null}
      <div className={styles.connectionList}><div className={styles.listHeader}><h2>Connections <span>{claims.length}</span></h2><label><input type="checkbox" checked={focused} onChange={(event) => setFocused(event.target.checked)} />Focus selected node</label></div><div className={styles.relationships}>{claims.map((claim) => <button key={claim.id} data-connection-select={claim.id} aria-pressed={edgeId === claim.id} onClick={() => select(claim.from, claim.id)}><span>{document.entities.find((item) => item.id === claim.from)?.label} → {document.entities.find((item) => item.id === claim.to)?.label}<small>{claim.label}{!claim.observedOn ? " · Date not established" : ""}</small></span></button>)}</div>{!claims.length ? <p>No relationships have sufficient evidence for these filters.</p> : null}</div>
    </div><aside className={styles.inspector} aria-label="Selected connection evidence" aria-live="polite">
      <h2>{selected ? `${document.entities.find((item) => item.id === selected.from)?.label} → ${document.entities.find((item) => item.id === selected.to)?.label}` : entity?.label ?? "Select a node"}</h2>
      {selected ? <><h3>{selected.label}</h3><p className={styles.date}>{selected.dated}</p><h4>Evidence</h4><p>{selected.establishes}</p><div className={styles.limit}><h4>Limits</h4><p>{selected.limitation}</p></div>{selected.ownership ? <p>Economic interest: {selected.ownership.economicPct === null ? "Not established" : `${selected.ownership.economicPct}%`} · Voting interest: {selected.ownership.votingPct === null ? "Not established" : `${selected.ownership.votingPct}%`}</p> : null}</> : <><p>{entity?.description}</p><div className={styles.inspectorRelations}>{related.map((claim) => <button key={claim.id} onClick={() => select(nodeId, claim.id)}>{claim.label}</button>)}</div><button className={styles.textButton} onClick={() => setPinned((current) => current.includes(nodeId) ? current.filter((id) => id !== nodeId) : [...current, nodeId])}>{pinned.includes(nodeId) ? "Unpin node" : "Pin node"}</button></>}
      <h4>Source passages</h4>{evidence.map((item) => { const source = document.sources.find((record) => record.id === item.sourceId)!; const revision = document.revisions.find((record) => record.id === item.revisionId); return <details key={item.id} className={styles.passage}><summary>{source.title} · {item.relation}</summary><p>{item.attribution.replaceAll("_", " ")}</p><p>{item.locator.page ? `Page ${item.locator.page}: ` : ""}{item.locator.section}</p>{item.locator.pointer ? <code>{item.locator.pointer}</code> : null}{item.excerpt ? <blockquote>{item.excerpt}</blockquote> : null}<a href={source.url} target="_blank" rel="noopener noreferrer">Original source ↗</a>{revision ? <p>Captured {revision.capturedAt ?? revision.retrievedAt} · {revision.completeness}<br />Retrieval date: {revision.retrievedAt ?? "not established"}<br /><code>{revision.sha256}</code></p> : <p>Content check only; retained revision unavailable.</p>}</details>; })}
      {entity?.identifiers.countyFips ? <a href={`/api/v1/result-lineage?state=TX&year=2024&office=president&level=county&jurisdictionCode=${entity.identifiers.countyFips}`}>Inspect 2024 result source chain ↗</a> : null}
      <details className={styles.paths}><summary>Find connections</summary><label>Destination<select value={pathTo} onChange={(event) => setPathTo(event.target.value)}><option value="">Select entity</option>{document.entities.filter((item) => item.id !== nodeId).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label><input type="checkbox" checked={dataRoute} onChange={(event) => setDataRoute(event.target.checked)} />Directed results-delivery relationships only</label>{pathTo ? path.length ? <ol>{path.map((id) => { const claim = filtered.find((item) => item.id === id)!; return <li key={id}><button onClick={() => select(claim.from, claim.id)}>{claim.label}</button><p>{claim.dated}</p><p>{claim.limitation}</p></li>; })}</ol> : <p>No documented path within six relationships and the selected filters.</p> : null}</details>
    </aside></div>
    <details className={styles.research}><summary><h2>Research questions <span>{document.questions.length}</span></h2></summary><div className={styles.researchGrid}>{document.questions.map((question) => <details key={question.id}><summary>{question.title} · {question.status.replaceAll("_", " ")}</summary><p>{question.question}</p><h3>Evidence needed</h3><p>{question.needed}</p>{question.finding ? <p>{question.finding}</p> : null}</details>)}</div></details>
    <details className={styles.research}><summary>Saved views</summary><div className={styles.filters}><label>View name<input maxLength={80} value={saveName} onChange={(event) => setSaveName(event.target.value)} /></label><button onClick={save}>Save in this browser</button><button onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setNotice("Link copied."); } catch { setNotice("Copy this page’s address to share its filters."); } }}>Copy share link</button><button onClick={() => { setPositions({}); setPinned([]); }}>Reset positions</button>{saved.map((item) => <button key={item.name} onClick={() => load(item)}>{item.name}</button>)}</div></details>
    {notice ? <p role="status">{notice}</p> : null}
  </section>;
}
