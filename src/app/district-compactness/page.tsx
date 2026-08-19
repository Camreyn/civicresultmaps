import type { Metadata } from "next";
import {
  ArrowLeft,
  Braces,
  ExternalLink,
  Ruler,
  Shapes,
  TriangleAlert,
} from "lucide-react";

import { BrandMark } from "../brand-mark";
import {
  getDistrictCompactnessDataset,
  listDistrictCompactnessStateOptions,
  queryDistrictCompactness,
  type DistrictCompactnessSort,
  type DistrictGeographyType,
  type DistrictResolutionStability,
} from "@/lib/district-compactness";
import styles from "./district-compactness.module.css";

export const metadata: Metadata = {
  title: "District Compactness Explorer",
  description: "Advisory Polsby-Popper and convex-hull measurements for official 2024 U.S. congressional and state legislative district boundaries.",
  alternates: { canonical: "/district-compactness" },
};

type SearchValue = string | string[] | undefined;
type PageProps = { searchParams: Promise<Record<string, SearchValue>> };

const geographyTypes = new Set<DistrictGeographyType>(["congressional", "state_upper", "state_lower"]);
const stabilityValues = new Set<DistrictResolutionStability>(["stable", "resolution_sensitive"]);
const sortValues = new Set<DistrictCompactnessSort>([
  "polsby_asc", "polsby_desc", "hull_asc", "resolution_difference_desc", "state_asc",
]);

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

function safeInteger(value: string | undefined, fallback: number) {
  return value && /^\d+$/.test(value) ? Number(value) : fallback;
}

function metric(value: number) {
  return value.toFixed(3);
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function pageHref(params: URLSearchParams, offset: number) {
  const next = new URLSearchParams(params);
  if (offset > 0) next.set("offset", String(offset));
  else next.delete("offset");
  const query = next.toString();
  return query ? `/district-compactness?${query}` : "/district-compactness";
}

export default async function DistrictCompactnessPage({ searchParams }: PageProps) {
  const requested = await searchParams;
  const stateOptions = listDistrictCompactnessStateOptions();
  const validStates = new Set(stateOptions.map((option) => option.code));
  const requestedState = first(requested.state)?.trim().toUpperCase();
  const stateCode = requestedState && validStates.has(requestedState) ? requestedState : undefined;
  const requestedGeography = first(requested.geography)?.trim().toLowerCase();
  const geographyType = geographyTypes.has(requestedGeography as DistrictGeographyType)
    ? requestedGeography as DistrictGeographyType
    : undefined;
  const requestedStability = first(requested.stability)?.trim().toLowerCase();
  const resolutionStability = stabilityValues.has(requestedStability as DistrictResolutionStability)
    ? requestedStability as DistrictResolutionStability
    : undefined;
  const requestedSort = first(requested.sort)?.trim().toLowerCase();
  const sort = sortValues.has(requestedSort as DistrictCompactnessSort)
    ? requestedSort as DistrictCompactnessSort
    : "polsby_asc";
  const query = first(requested.q)?.trim().slice(0, 100) ?? "";
  const offset = Math.max(0, safeInteger(first(requested.offset), 0));
  const pageSize = 100;
  const result = queryDistrictCompactness({
    geographyType,
    limit: pageSize,
    offset,
    query,
    resolutionStability,
    sort,
    stateCode,
  });
  const dataset = getDistrictCompactnessDataset();
  const stableCount = dataset.rows.filter((row) => row.resolutionStability === "stable").length;
  const sensitiveCount = dataset.rows.length - stableCount;
  const currentParams = new URLSearchParams();
  if (stateCode) currentParams.set("state", stateCode);
  if (geographyType) currentParams.set("geography", geographyType);
  if (resolutionStability) currentParams.set("stability", resolutionStability);
  if (query) currentParams.set("q", query);
  if (sort !== "polsby_asc") currentParams.set("sort", sort);
  const pageStart = result.rows.length === 0 ? 0 : result.offset + 1;
  const pageEnd = result.rows.length === 0
    ? 0
    : Math.min(result.offset + result.rows.length, result.total);

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/">
          <BrandMark />
          <span><strong>Civic Result Maps</strong><small>District shape lab</small></span>
        </a>
        <nav aria-label="Primary navigation" className={styles.topnav}>
          <a href="/compare"><ArrowLeft aria-hidden size={15} />County comparison</a>
          <a href="/api/district-compactness"><Braces aria-hidden size={15} />API</a>
        </nav>
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}><Shapes aria-hidden size={15} />Advisory boundary-shape measurements</p>
          <h1>District compactness, without pretending it proves intent.</h1>
          <p className={styles.lede}>
            Compare Polsby–Popper and convex-hull ratios for official 2024 congressional and state legislative
            boundaries. Detailed measurements are checked against Census 1:500,000 geometry so resolution-sensitive
            shapes remain visible instead of becoming false precision.
          </p>
        </div>
        <aside className={styles.planCard}>
          <span>Plan vintage</span>
          <strong>{dataset.plan.effectiveDate}</strong>
          <p>{dataset.plan.congressionalPlan}; {dataset.plan.stateLegislativePlan}.</p>
          <a href="https://www.census.gov/programs-surveys/decennial-census/about/rdo/state-legislative-district.2024.html">
            Census plan context <ExternalLink aria-hidden size={13} />
          </a>
        </aside>
      </section>

      <section className={styles.explorer}>
        <div className={styles.metrics} aria-label="Dataset summary">
          <article><span>Measured districts</span><strong>{dataset.rows.length.toLocaleString()}</strong><small>15 undefined Census placeholders excluded</small></article>
          <article><span>Resolution-stable</span><strong>{stableCount.toLocaleString()}</strong><small>Within both screening thresholds</small></article>
          <article><span>Resolution-sensitive</span><strong>{sensitiveCount.toLocaleString()}</strong><small>Inspect before comparing ranks</small></article>
          <article><span>Filtered rows</span><strong>{result.total.toLocaleString()}</strong><small>Current state, chamber, and search</small></article>
        </div>

        <div className={styles.warning}>
          <TriangleAlert aria-hidden size={19} />
          <div>
            <strong>Compactness is a descriptive screen, not a gerrymandering severity score.</strong>
            <p>Low values can reflect coastlines, islands, political subdivisions, communities of interest, legal requirements, or map resolution. They do not establish partisan intent, illegality, representational quality, fraud, or misconduct.</p>
          </div>
        </div>

        <form action="/district-compactness" className={styles.controls} method="get">
          <label><span>State or territory</span><select defaultValue={stateCode ?? ""} name="state"><option value="">All</option>{stateOptions.map((option) => <option key={option.code} value={option.code}>{option.name} ({option.code})</option>)}</select></label>
          <label><span>District type</span><select defaultValue={geographyType ?? ""} name="geography"><option value="">All types</option><option value="congressional">Congressional</option><option value="state_upper">State upper chamber</option><option value="state_lower">State lower chamber</option></select></label>
          <label><span>Resolution check</span><select defaultValue={resolutionStability ?? ""} name="stability"><option value="">All</option><option value="stable">Stable</option><option value="resolution_sensitive">Resolution-sensitive</option></select></label>
          <label><span>Search</span><input defaultValue={query} maxLength={100} name="q" placeholder="District, GEOID, or state" type="search" /></label>
          <label><span>Sort</span><select defaultValue={sort} name="sort"><option value="polsby_asc">Lowest Polsby–Popper</option><option value="polsby_desc">Highest Polsby–Popper</option><option value="hull_asc">Lowest convex-hull ratio</option><option value="resolution_difference_desc">Largest resolution difference</option><option value="state_asc">State and district</option></select></label>
          <div className={styles.actions}><button type="submit">Apply</button><a href="/district-compactness">Reset</a></div>
        </form>

        <section className={styles.tablePanel} aria-labelledby="district-table-heading">
          <header>
            <div><p className={styles.eyebrow}><Ruler aria-hidden size={14} />Comparable shape metrics</p><h2 id="district-table-heading">Official plan boundaries</h2></div>
            <p>Showing {pageStart.toLocaleString()}–{pageEnd.toLocaleString()} of {result.total.toLocaleString()}</p>
          </header>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>District</th><th>Type</th><th>Polsby–Popper</th><th>Convex hull</th><th>Relative percentile</th><th>Resolution check</th><th>Boundary detail</th></tr></thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={`${row.geographyType}:${row.geoid}`}>
                    <td><strong>{row.stateCode} · {row.name}</strong><small>GEOID {row.geoid} · effective {row.planEffectiveDate}</small></td>
                    <td>{row.chamberLabel}</td>
                    <td><strong>{metric(row.polsbyPopper)}</strong><small>500K: {metric(row.generalizedPolsbyPopper)}</small></td>
                    <td><strong>{metric(row.convexHullRatio)}</strong><small>500K: {metric(row.generalizedConvexHullRatio)}</small></td>
                    <td><strong>{row.relativeCompactnessPercentile.toFixed(1)}</strong><small>{row.relativeCompactnessBand.replaceAll("_", " ")}</small></td>
                    <td><span className={row.resolutionStability === "stable" ? styles.stable : styles.sensitive}>{row.resolutionStability.replace("_", " ")}</span><small>PP difference {percent(row.resolutionPolsbyRelativeDifference)}</small></td>
                    <td><strong>{row.perimeterKilometers.toLocaleString()} km</strong><small>{`${row.vertexCount.toLocaleString()} vertices · ${row.partCount} ${row.partCount === 1 ? "part" : "parts"} · ${row.holeCount} ${row.holeCount === 1 ? "hole" : "holes"}`}</small></td>
                  </tr>
                ))}
                {result.rows.length === 0 ? <tr><td className={styles.empty} colSpan={7}>No district rows match these filters.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <footer className={styles.pagination}>
            <span>Rows {pageStart.toLocaleString()}–{pageEnd.toLocaleString()}</span>
            <div>
              {result.offset > 0 ? <a href={pageHref(currentParams, Math.max(0, result.offset - pageSize))}>Previous</a> : <span>Previous</span>}
              {result.offset + result.rows.length < result.total ? <a href={pageHref(currentParams, result.offset + pageSize)}>Next</a> : <span>Next</span>}
            </div>
          </footer>
        </section>

        <section className={styles.methodology}>
          <article>
            <p className={styles.eyebrow}>How the measures work</p>
            <h2>Two measures, one stability guard.</h2>
            <dl><div><dt>Polsby–Popper</dt><dd>4π × area ÷ perimeter². A circle approaches 1. Coastline and boundary detail can sharply increase perimeter.</dd></div><div><dt>Convex-hull ratio</dt><dd>District area divided by its local equal-area convex hull. Disconnected or deeply concave shapes score lower.</dd></div><div><dt>Resolution guard</dt><dd>Detailed and 1:500,000 values are labeled stable only when their relative differences stay within 20% and 10%, respectively.</dd></div></dl>
          </article>
          <article className={styles.resultBoundary}>
            <p className={styles.eyebrow}>Election-result boundary</p>
            <h2>Outcome relationships are not calculated yet.</h2>
            <p>{dataset.resultRelationship.reason}</p>
            <p>That guard prevents district results from being compared against a different plan vintage or geography.</p>
          </article>
        </section>

        <section className={styles.sources}>
          <div><p className={styles.eyebrow}>Source provenance</p><h2>U.S. Census Bureau TIGERweb</h2><p>Six retained and hash-pinned GeoJSON collections cover detailed and generalized versions of each district type.</p></div>
          <ul>{dataset.sources.map((source) => <li key={`${source.geographyType}:${source.resolution}`}><a href={source.sourcePageUrl}>{source.geographyType.replaceAll("_", " ")} · {source.resolution.replace("_", " ")} <ExternalLink aria-hidden size={12} /></a><span>{source.featureCount.toLocaleString()} source features</span></li>)}</ul>
        </section>
      </section>
    </main>
  );
}
