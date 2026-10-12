"use client";
import { useState } from "react";
import type { ResearchSourceRevision } from "@/lib/connection-research";
import styles from "./research.module.css";

export function SourceComparison({ revisions }: { revisions: ResearchSourceRevision[] }) {
  const [left, setLeft] = useState(revisions[0]?.id ?? "");
  const [right, setRight] = useState(revisions.at(-1)?.id ?? "");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Array<{ text: string; derivative: string }> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function compare() {
    setBusy(true); setError(""); setResult(null);
    try {
      const values = await Promise.all([left, right].map(async (id) => {
        const response = await fetch(`/api/admin/connections/artifacts/${id}/text?page=${page}`, { cache: "no-store" });
        const value = await response.json(); if (!response.ok) throw new Error(value.error); return value;
      }));
      setResult(values);
    } catch (error) { setError(error instanceof Error ? error.message : "Comparison unavailable"); }
    finally { setBusy(false); }
  }
  if (!revisions.length) return null;
  const select = (value: string, change: (id: string) => void, label: string) => <label className={styles.field}>{label}<select value={value} onChange={(event) => change(event.target.value)}>{revisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.capturedAt ?? revision.retrievedAt ?? "Date unknown"} · {revision.sha256.slice(0, 12)}</option>)}</select></label>;
  return <div className={styles.comparison}><h2>Compare retained sources</h2><div className={styles.toolbar}>{select(left, setLeft, "Earlier revision")}{select(right, setRight, "Later revision")}<label>PDF page<input type="number" min="1" max="2000" value={page} onChange={(event) => setPage(Number(event.target.value))} /></label><button disabled={busy} onClick={compare}>Compare text</button></div>{error ? <p role="status">{error}</p> : null}{result ? <><p>{result[0].derivative}</p><div className={styles.compareColumns}>{result.map((value, index) => <pre key={index}>{value.text}</pre>)}</div></> : null}</div>;
}
