"use client";

import { Download, TriangleAlert } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import {
  buildShpilkinHistogram,
  listShpilkinCountyOptions,
  shpilkinBucketWidths,
  type ShpilkinAccumulation,
  type ShpilkinBucketWidth,
  type ShpilkinCandidate,
  type ShpilkinScope,
  type ShpilkinXAxis,
} from "@/lib/shpilkin-histogram";
import type { ReviewRowSummary, TurnoutRowSummary } from "@/lib/types";
import { Eli5 } from "./eli5";

type ShpilkinHistogramProps = {
  countyLabel: string;
  electionYear: number;
  reviewRows: ReviewRowSummary[];
  stateCode: string;
  stateName: string;
  turnoutRows: TurnoutRowSummary[];
};

const scopeOptions: Array<{ key: ShpilkinScope; label: string }> = [
  { key: "state_county", label: "State · counties" },
  { key: "state_local", label: "State · local units" },
  { key: "county_local", label: "County · local units" },
];
const xAxisOptions: Array<{ key: ShpilkinXAxis; label: string }> = [
  { key: "candidate_share", label: "Candidate vote share" },
  { key: "turnout", label: "Turnout" },
];
const accumulationOptions: Array<{ key: ShpilkinAccumulation; label: string }> = [
  { key: "votes", label: "Accumulated votes" },
  { key: "units", label: "Accumulated sub-jurisdictions" },
];
const yGridRatios = [0, 0.25, 0.5, 0.75, 1];
const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compactFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});

function formatCount(value: number) {
  return integerFormatter.format(Math.round(value));
}

function pluralizeCountyLabel(label: string) {
  if (/ies$/iu.test(label)) return label;
  if (/y$/iu.test(label)) return `${label.slice(0, -1)}ies`;
  if (/(?:s|x|z|ch|sh)$/iu.test(label)) return `${label}es`;
  return `${label}s`;
}

function friendlyLevel(level: string) {
  const normalized = level.trim().toLowerCase();
  const labels: Record<string, string> = {
    city: "cities",
    city_town: "cities and towns",
    election_district: "election districts",
    local: "local reporting units",
    local_reporting_unit: "local reporting units",
    precinct: "precincts",
    rest_of_county: "rest-of-county units",
    town: "towns",
    vtd: "VTDs",
    ward: "wards",
  };
  return labels[normalized] ?? normalized.replaceAll("_", " ");
}

function downloadSvg(svg: SVGSVGElement, filename: string) {
  const content = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([content], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ChoiceButtons<Key extends string | number>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: Key) => void;
  options: Array<{ disabled?: boolean; key: Key; label: string }>;
  value: Key;
}) {
  return (
    <fieldset className="shpilkin-control-group">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            aria-pressed={value === option.key}
            disabled={option.disabled}
            key={option.key}
            onClick={() => onChange(option.key)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ShpilkinHistogram({
  countyLabel,
  electionYear,
  reviewRows,
  stateCode,
  stateName,
  turnoutRows,
}: ShpilkinHistogramProps) {
  const [scope, setScope] = useState<ShpilkinScope>("state_county");
  const [xAxis, setXAxis] = useState<ShpilkinXAxis>("candidate_share");
  const [accumulation, setAccumulation] = useState<ShpilkinAccumulation>("votes");
  const [candidate, setCandidate] = useState<ShpilkinCandidate>("dem");
  const [bucketWidth, setBucketWidth] = useState<ShpilkinBucketWidth>(1);
  const [requestedCountyTag, setRequestedCountyTag] = useState("");
  const [acknowledgedKeys, setAcknowledgedKeys] = useState<string[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const countyOptions = useMemo(
    () => listShpilkinCountyOptions(reviewRows, turnoutRows),
    [reviewRows, turnoutRows],
  );
  const selectedCountyTag = countyOptions.some((option) => option.tag === requestedCountyTag)
    ? requestedCountyTag
    : countyOptions[0]?.tag ?? "";
  const selectedCounty = countyOptions.find((option) => option.tag === selectedCountyTag);
  const histogram = useMemo(
    () => buildShpilkinHistogram({
      accumulation,
      bucketWidth,
      candidate,
      countyTag: selectedCountyTag,
      reviewRows,
      scope,
      turnoutRows,
      xAxis,
    }),
    [accumulation, bucketWidth, candidate, reviewRows, scope, selectedCountyTag, turnoutRows, xAxis],
  );

  const issues = [
    histogram.omittedObservationCount > 0
      ? `${formatCount(histogram.omittedObservationCount)} observations are omitted because the selected percentage or vote weight is unavailable.`
      : "",
    histogram.untaggedSourceRowCount > 0 && scope === "state_county"
      ? `${formatCount(histogram.untaggedSourceRowCount)} source rows lack a canonical county tag and are not rolled into county observations.`
      : "",
    histogram.warningObservationCount > 0
      ? `${formatCount(histogram.warningObservationCount)} turnout observations carry a denominator warning from the source pipeline.`
      : "",
    xAxis === "turnout" && histogram.denominatorNotes.length > 1
      ? `This selection combines ${formatCount(histogram.denominatorNotes.length)} source denominator notes; confirm that the definitions are comparable.`
      : "",
    histogram.overflowObservationCount > 0
      ? `${formatCount(histogram.overflowObservationCount)} observations exceed 200% and are grouped into the final overflow bucket.`
      : "",
    histogram.drawableObservationCount > 0 && histogram.drawableObservationCount < 10
      ? "Fewer than 10 drawable sub-jurisdictions are available, so the distribution shape is fragile."
      : "",
  ].filter(Boolean);
  const status = histogram.drawableObservationCount === 0 ? "blocked" : issues.length ? "partial" : "ready";
  const diagnosticKey = [
    stateCode,
    electionYear,
    scope,
    selectedCountyTag,
    xAxis,
    accumulation,
    candidate,
    bucketWidth,
    histogram.drawableObservationCount,
  ].join(":");
  const acknowledged = acknowledgedKeys.includes(diagnosticKey);
  const gated = status !== "ready" && !acknowledged;
  const candidateAxisLabel = `${histogram.candidateLabel} vote share`;
  const xAxisLabel = xAxis === "candidate_share" ? candidateAxisLabel : "Turnout percentage";
  const yAxisLabel = accumulation === "units"
    ? "Sub-jurisdiction count"
    : xAxis === "turnout" ? "Ballots cast" : "Presidential votes";
  const scopeLabel = scope === "state_county"
    ? `${stateName} · ${pluralizeCountyLabel(countyLabel)}`
    : scope === "county_local"
      ? `${selectedCounty?.name ?? countyLabel} · local reporting units`
      : `${stateName} · local reporting units`;
  const unitLabel = scope === "state_county"
    ? pluralizeCountyLabel(countyLabel).toLowerCase()
    : histogram.levels.length === 1
      ? friendlyLevel(histogram.levels[0])
      : "local reporting units";
  const xTicks = [...new Set([0, 25, 50, 75, 100, histogram.domainMax])]
    .filter((value) => value <= histogram.domainMax)
    .sort((left, right) => left - right);
  const plot = { bottom: 300, height: 250, left: 76, right: 836, top: 50, width: 760 };
  const barSlot = plot.width / histogram.buckets.length;
  const chartSummary = `${scopeLabel}: ${yAxisLabel.toLowerCase()} by ${xAxisLabel.toLowerCase()} in ${bucketWidth}-percentage-point buckets.`;

  return (
    <article className="history-chart-card wide shpilkin-workbench" data-tour="history-shpilkin">
      <div className="shpilkin-heading">
        <div>
          <strong>Shpilkin-Style Distribution Histograms</strong>
          <span>
            Four requested views: accumulated votes or sub-jurisdictions, bucketed by candidate share or turnout.
          </span>
        </div>
        <div className="shpilkin-heading-actions">
          <button
            className="secondary-button"
            disabled={gated || status === "blocked"}
            onClick={() => svgRef.current && downloadSvg(
              svgRef.current,
              `${stateCode.toLowerCase()}-${electionYear}-shpilkin-${xAxis}-${accumulation}-${bucketWidth}pct.svg`,
            )}
            type="button"
          >
            <Download aria-hidden size={15} />
            Download SVG
          </button>
          <Eli5>
            Imagine sorting places into percentage buckets. One switch stacks their votes; the other counts the places.
            A tall bar describes where observations cluster, but it does not explain why they cluster there.
          </Eli5>
        </div>
      </div>

      <div className="data-warning strong-warning" role="status">
        <TriangleAlert aria-hidden size={18} />
        <div>
          <strong>Descriptive screening view—not a finding</strong>
          <span>
            Distribution shape changes with geography, bucket width, candidate choice, turnout definition, and source
            coverage. Use official audits and source reconciliation before drawing conclusions.
          </span>
        </div>
      </div>

      <div className="shpilkin-controls" aria-label="Shpilkin histogram controls">
        <ChoiceButtons
          label="Jurisdiction scale"
          onChange={setScope}
          options={scopeOptions.map((option) => ({
            ...option,
            disabled: option.key === "county_local" && countyOptions.length === 0,
            label: option.key === "state_county"
              ? `State · ${pluralizeCountyLabel(countyLabel).toLowerCase()}`
              : option.key === "county_local"
                ? `${countyLabel} · local units`
                : option.label,
          }))}
          value={scope}
        />
        {scope === "county_local" ? (
          <label className="shpilkin-county-select" htmlFor={`${titleId}-county`}>
            <span>{countyLabel}</span>
            <select
              id={`${titleId}-county`}
              onChange={(event) => setRequestedCountyTag(event.target.value)}
              value={selectedCountyTag}
            >
              {countyOptions.map((option) => (
                <option key={option.tag} value={option.tag}>{option.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <ChoiceButtons label="Horizontal axis" onChange={setXAxis} options={xAxisOptions} value={xAxis} />
        {xAxis === "candidate_share" ? (
          <ChoiceButtons
            label="Candidate"
            onChange={setCandidate}
            options={[
              { key: "dem", label: "Democratic" },
              { key: "rep", label: "Republican" },
            ]}
            value={candidate}
          />
        ) : null}
        <ChoiceButtons
          label="Vertical accumulation"
          onChange={setAccumulation}
          options={accumulationOptions}
          value={accumulation}
        />
        <ChoiceButtons
          label="Bucket width"
          onChange={setBucketWidth}
          options={shpilkinBucketWidths.map((width) => ({ key: width, label: `${width}%` }))}
          value={bucketWidth}
        />
      </div>

      <div className={`chart-quality-notice ${status === "partial" ? "acknowledgement_required" : status}`} role="status">
        <div className="chart-quality-head">
          <div>
            <span>{status === "ready" ? "Ready" : status === "blocked" ? "Blocked" : "Partial"}</span>
            <strong>
              {status === "ready"
                ? "The selected histogram has complete drawable inputs."
                : status === "blocked"
                  ? "The selected scope and mode have no drawable observations."
                  : "The selected histogram has source or coverage limits to review."}
            </strong>
          </div>
          <span className={`quality-badge ${status === "partial" ? "partial" : status}`}>
            {status === "ready" ? "Ready" : status === "blocked" ? "Blocked" : "Partial"}
          </span>
        </div>
        {issues.length ? (
          <div className="chart-blocking-reason">
            <strong>Limits for this selection</strong>
            <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
          </div>
        ) : null}
        {histogram.denominatorNotes.length ? (
          <details>
            <summary>Turnout denominator notes</summary>
            <ul>{histogram.denominatorNotes.map((note) => <li key={note}>{note}</li>)}</ul>
          </details>
        ) : null}
      </div>

      <dl className="shpilkin-stats">
        <div><dt>Drawable units</dt><dd>{formatCount(histogram.drawableObservationCount)}</dd></div>
        <div><dt>Accumulated total</dt><dd>{formatCount(histogram.totalValue)}</dd></div>
        <div><dt>Source datasets</dt><dd>{formatCount(histogram.sourceCount)}</dd></div>
        <div><dt>Bucket width</dt><dd>{bucketWidth}%</dd></div>
      </dl>

      <div className={`screening-chart-shell ${gated ? "is-gated" : ""}`}>
        <div className="chart-gate-frame shpilkin-svg-frame">
          {histogram.drawableObservationCount > 0 ? (
            <svg
              aria-describedby={descriptionId}
              aria-hidden={gated}
              aria-labelledby={titleId}
              ref={svgRef}
              role="img"
              viewBox="0 0 860 390"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title id={titleId}>{chartSummary}</title>
              <desc id={descriptionId}>
                {formatCount(histogram.drawableObservationCount)} {unitLabel} grouped into {bucketWidth}-percentage-point buckets.
              </desc>
              <rect className="screening-svg-bg" height="390" width="860" />
              {yGridRatios.map((ratio) => {
                const y = plot.bottom - ratio * plot.height;
                return (
                  <g key={ratio}>
                    <line className="screening-gridline" x1={plot.left} x2={plot.right} y1={y} y2={y} />
                    <text className="screening-axis-label" textAnchor="end" x={plot.left - 10} y={y + 4}>
                      {compactFormatter.format(histogram.maxBucketValue * ratio)}
                    </text>
                  </g>
                );
              })}
              {xTicks.map((tick) => {
                const x = plot.left + (tick / histogram.domainMax) * plot.width;
                return (
                  <g key={tick}>
                    <line className="shpilkin-x-gridline" x1={x} x2={x} y1={plot.top} y2={plot.bottom} />
                    <text className="screening-axis-label" textAnchor="middle" x={x} y={plot.bottom + 22}>{tick}%</text>
                  </g>
                );
              })}
              <text className="screening-title" x={plot.left} y="27">{scopeLabel} · {electionYear}</text>
              <text className="screening-axis-title centered" x={(plot.left + plot.right) / 2} y="372">
                {xAxisLabel}
              </text>
              <text className="screening-axis-title vertical" transform="translate(18 225) rotate(-90)">
                {yAxisLabel}
              </text>
              {histogram.buckets.map((bucket, index) => {
                const height = histogram.maxBucketValue > 0
                  ? (bucket.value / histogram.maxBucketValue) * plot.height
                  : 0;
                const x = plot.left + index * barSlot + Math.min(1, barSlot * 0.08);
                const width = Math.max(0.7, barSlot - Math.min(2, barSlot * 0.16));
                return (
                  <rect
                    className={`shpilkin-svg-bar ${xAxis === "turnout" ? "turnout" : candidate}`}
                    data-observation-count={bucket.unitCount}
                    height={height}
                    key={bucket.low}
                    width={width}
                    x={x}
                    y={plot.bottom - height}
                  >
                    <title>{`${bucket.label}: ${formatCount(bucket.value)} ${accumulation === "votes" ? "votes" : "sub-jurisdictions"}; ${formatCount(bucket.unitCount)} units`}</title>
                  </rect>
                );
              })}
              <line className="fingerprint-axis" x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} />
              <line className="fingerprint-axis" x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.bottom} />
            </svg>
          ) : (
            <div className="empty-state compact shpilkin-empty">
              <strong>No compatible observations for this selection</strong>
              <span>
                Candidate-share views need review rows. Turnout views need source-reported ballots and a usable denominator.
              </span>
            </div>
          )}
        </div>
        {gated ? (
          <div className="screening-chart-gate" data-tour="chart-caveat-gate">
            <TriangleAlert aria-hidden size={22} />
            <strong>{status === "blocked" ? "This chart cannot be drawn yet" : "Read this before viewing"}</strong>
            <p>
              {status === "blocked"
                ? "The current data do not support this scope and axis combination."
                : "This selection has incomplete or warning-marked inputs. Review the listed limits before opening it."}
            </p>
            {status !== "blocked" ? (
              <button
                className="secondary-button"
                onClick={() => setAcknowledgedKeys((current) =>
                  current.includes(diagnosticKey) ? current : [...current, diagnosticKey]
                )}
                type="button"
              >
                I acknowledge these limits
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <details className="how-to-read">
        <summary>How this histogram is calculated</summary>
        <p>
          Candidate-share buckets use presidential review rows and accumulate presidential votes. Turnout buckets use
          turnout rows and accumulate ballots cast. The sub-jurisdiction option gives every drawable unit a weight of one.
        </p>
        <p>
          State-by-{pluralizeCountyLabel(countyLabel).toLowerCase()} mode rolls rows up only through canonical county tags.
          County-by-local-unit mode filters on that same tag; it does not infer parentage from a display name. Each bucket
          retains the contributing source-row IDs so a future fingerprint scatterplot can reuse the same membership.
        </p>
      </details>
    </article>
  );
}
