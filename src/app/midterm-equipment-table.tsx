"use client";

import { useMemo, useState } from "react";
import { filterMidtermEquipment, midtermEquipment, midtermSource } from "@/lib/midterm-equipment";
import styles from "./midterm-workspace.module.css";

const families = [...new Set(midtermEquipment.rows.map((row) => row.family))].sort();

export function MidtermEquipmentTable({ initialCounty = "" }: { initialCounty?: string }) {
  const [query, setQuery] = useState(initialCounty);
  const [family, setFamily] = useState("");
  const rows = useMemo(() => filterMidtermEquipment(query, family), [query, family]);
  return (
    <>
      <div className={styles.filters}>
        <label>County, FIPS, or system family
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Search all 62 counties" type="search" value={query} />
        </label>
        <label>Listed system family
          <select aria-label="Listed system family" onChange={(event) => setFamily(event.target.value)} value={family}>
            <option value="">All families</option>
            {families.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        {(query || family) && <button onClick={() => { setQuery(""); setFamily(""); }} type="button">Clear filters</button>}
      </div>
      <p aria-live="polite" className={styles.muted}>{rows.length} of 62 counties shown. Every row links to its official county-list section.</p>
      <div className={styles.tableScroll}>
        <table>
          <caption>New York county equipment — NYSBOE source snapshot checked November 2, 2026</caption>
          <thead><tr><th scope="col">County</th><th scope="col">NYSBOE-listed system family</th><th scope="col">Separate central count / audit listing</th><th scope="col">Evidence limits</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.fips}>
                <th scope="row">{row.county}<span className={styles.fips}>{row.fips}</span></th>
                <td><strong>{row.family}</strong><a href={midtermSource(row.sourceId).url}>{midtermSource(row.sourceId).title} · official county list ↗</a></td>
                <td>{row.additionalEquipment.length
                  ? <><strong>Clear Ballot</strong><a href={midtermSource("clear-ballot").url}>Central count/audit tool only ↗</a></>
                  : <span className={styles.muted}>No separate listing in these sources</span>}</td>
                <td><span>Official listing; November 2026 deployment not independently confirmed.</span>
                  {row.notes && <p className={styles.conflict}>{row.notes} <a href={midtermSource("legacy-ess").url}>Legacy ES&S source ↗</a></p>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4}>No counties match these filters. Clear filters to see all counties.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
