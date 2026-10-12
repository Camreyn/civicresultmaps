"use client";
import { useState } from "react";
import type { ConnectionComparisons } from "@/lib/connection-release-comparison";
import styles from "./connections.module.css";

export function ReleaseComparison({ data }: { data: ConnectionComparisons }) {
  const [baseline, setBaseline] = useState("");
  const comparison = data.comparisons.find((item) => item.previous.id === baseline) ?? data.comparisons[0];
  return <details className={styles.research}>
    <summary>What changed between reviewed releases?</summary>
    {data.status === "disabled" ? <p>Comparison is not available for the documentary catalog. Reviewed releases have not been activated; the 2024/2026 views are not release versions.</p> : data.status === "unavailable" ? <p role="status">Reviewed snapshot comparison is unavailable. No draft or documentary snapshot has been substituted.</p> : !comparison ? <p>No earlier reviewed snapshot is available to compare.</p> : <>
      <p>Compare the current reviewed snapshot with up to 12 earlier workspace snapshots. A rollback excludes versions newer than the restored snapshot. This is not a complete publication or rollback log, nor a live source-change monitor. Removal from a release does not establish that a relationship ended.</p>
      <label className={styles.comparisonSelect}>Earlier snapshot<select value={comparison.previous.id} onChange={(event) => setBaseline(event.target.value)}>{data.comparisons.map((item) => <option key={item.previous.id} value={item.previous.id}>{item.previous.reviewedOn} · {item.previous.id}</option>)}</select></label>
      <p className={styles.releaseIds}>Earlier: {comparison.previous.id}<br />Current: {comparison.current.id}</p>
      <div className={styles.comparisonTable}><table><caption>Record changes from earlier to current snapshot</caption><thead><tr><th scope="col">Records</th><th scope="col">Added</th><th scope="col">Changed</th><th scope="col">Removed</th></tr></thead><tbody>{Object.entries(comparison.counts).map(([key, counts]) => <tr key={key}><th scope="row">{key === "claims" ? "Relationships" : key}</th><td>{counts.added}</td><td>{counts.changed}</td><td>{counts.removed}</td></tr>)}</tbody></table></div>
      <ul>{comparison.changes.map((item) => <li key={item.id}><strong>{item.label}</strong> · {item.change}{item.fields.length ? ` (${item.fields.join(", ")})` : ""}</li>)}</ul>
      {comparison.removedIds.length ? <p>Removed relationship IDs: {comparison.removedIds.join(", ")}. Prior wording and withdrawn labels are intentionally not republished.</p> : null}
    </>}
  </details>;
}
