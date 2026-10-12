"use client";
import { useState } from "react";
import type { ResultRow } from "@/lib/types";
import type { evaluateResultLineage } from "@/lib/result-lineage";

type Chain = { candidates: ReturnType<typeof evaluateResultLineage>; displayVerification: string };
export function ResultSourceChain({ result }: { result: ResultRow }) {
  const [chain, setChain] = useState<Chain | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (result.state !== "TX" || result.year !== 2024 || result.level !== "county" || result.office.toLowerCase() !== "president") return null;
  async function inspect() {
    setBusy(true); setMessage(""); setChain(null);
    try {
      const params = new URLSearchParams({ state: result.state, year: String(result.year), office: result.office.toLowerCase(), level: result.level, jurisdictionCode: result.jurisdictionTag ?? result.jurisdictionCode });
      const response = await fetch(`/api/v1/result-lineage?${params}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Result source chain unavailable.");
      const value = payload.data as Chain;
      const candidates = value.candidates;
      const matches = candidates.length === Object.keys(result.votes).length && candidates.every((candidate) => result.votes[candidate.candidate] === candidate.votes)
        && candidates.reduce((total, candidate) => total + candidate.votes, 0) === result.totalVotes;
      setChain(value); setMessage(matches ? "Displayed candidate values match these database rows. Source and import checks are shown separately." : "Displayed values differ from the inspected rows. Reload results before using this chain.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Result source chain unavailable."); }
    finally { setBusy(false); }
  }
  return <div className="drawer-source"><button type="button" disabled={busy} onClick={inspect}>{busy ? "Inspecting…" : "Inspect source chain"}</button>{message ? <p role="status">{message}</p> : null}{chain ? chain.candidates.map((candidate) => <details key={candidate.candidate}><summary>{candidate.candidate}: {candidate.votes.toLocaleString("en-US")} · {candidate.status.replaceAll("_", " ")}</summary><p><a href={candidate.source.url} target="_blank" rel="noopener noreferrer">{candidate.source.authority}</a></p><p>Source review: {candidate.source.reviewStatus.replaceAll("_", " ")}</p><p>Source hash: <code style={{ overflowWrap: "anywhere" }}>{candidate.source.sha256 ?? "not recorded"}</code></p><p>Import: {candidate.import.id ?? "not linked"} · {candidate.import.status ?? "unknown"}</p><p>Parser: {candidate.import.parser ?? "not recorded"}</p><dl>{Object.entries(candidate.checks).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{String(value)}</dd></div>)}</dl></details>) : null}</div>;
}
