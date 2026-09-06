"use client";

import { Download, TriangleAlert } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import {
  buildKlimekFingerprint,
  klimekBucketWidths,
  type KlimekBucketWidth,
  type KlimekPointSize,
} from "@/lib/klimek-fingerprint";
import {
  listShpilkinCountyOptions,
  type ShpilkinAccumulation,
  type ShpilkinScope,
} from "@/lib/shpilkin-histogram";
import { percentageTicks, type PercentageScaleMode } from "@/lib/percentage-scale";
import {
  buildKlimekHistogramContext,
  describeHistogramBin,
  histogramContextColors,
  type KlimekPointAppearance,
} from "@/lib/klimek-histogram-context";
import type { ReviewRowSummary, TurnoutRowSummary } from "@/lib/types";
import { Eli5 } from "./eli5";

type KlimekFingerprintProps = {
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
const accumulationOptions: Array<{ key: ShpilkinAccumulation; label: string }> = [
  { key: "votes", label: "Accumulated votes" },
  { key: "units", label: "Accumulated sub-jurisdictions" },
];
const pointSizeOptions: Array<{ key: KlimekPointSize; label: string }> = [
  { key: "total_votes", label: "Total presidential votes" },
  { key: "winner_votes", label: "Votes for loaded winner" },
];
const scaleModeOptions: Array<{ key: PercentageScaleMode; label: string }> = [
  { key: "comparison", label: "0%–100% (compare)" },
  { key: "fit", label: "Fit visible data" },
];
const pointAppearanceOptions: Array<{ key: KlimekPointAppearance; label: string }> = [
  { key: "winner_density", label: "Winner color · density" },
  { key: "histogram_context", label: "Histogram peaks / valleys" },
];
const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compactFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});

function formatCount(value: number) {
  return integerFormatter.format(Math.round(value));
}

function formatOptionalCount(value: number | null) {
  return value === null ? "unavailable" : formatCount(value);
}

function bucketLabel(low: number, value: number, domainMax: number, bucketWidth: KlimekBucketWidth) {
  return value > domainMax ? `≥${low}%` : `${low}-${Math.min(domainMax, low + bucketWidth)}%`;
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
  // The downloaded SVG has no page stylesheet. Preserve its paint and labels,
  // including the selected appearance, without modifying the live chart.
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originalElements = [svg, ...svg.querySelectorAll<SVGElement>("*")];
  const clonedElements = [clone, ...clone.querySelectorAll<SVGElement>("*")];
  const properties = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "opacity", "font-family", "font-size", "font-weight", "text-anchor"];
  originalElements.forEach((element, index) => {
    const computed = window.getComputedStyle(element);
    properties.forEach((property) => {
      // Do not bake a transient hover-opacity override into the chosen encoding.
      clonedElements[index].style.setProperty(property, element.style.getPropertyValue(property) || computed.getPropertyValue(property));
    });
  });
  const content = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([content], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function KlimekChoiceButtons<Key extends string | number>({
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

export function KlimekFingerprint({
  countyLabel,
  electionYear,
  reviewRows,
  stateCode,
  stateName,
  turnoutRows,
}: KlimekFingerprintProps) {
  const [scope, setScope] = useState<ShpilkinScope>("state_county");
  const [accumulation, setAccumulation] = useState<ShpilkinAccumulation>("votes");
  const [pointSize, setPointSize] = useState<KlimekPointSize>("total_votes");
  const [bucketWidth, setBucketWidth] = useState<KlimekBucketWidth>(1);
  const [scaleMode, setScaleMode] = useState<PercentageScaleMode>("comparison");
  const [pointAppearance, setPointAppearance] = useState<KlimekPointAppearance>("winner_density");
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
  const fingerprint = useMemo(
    () => buildKlimekFingerprint({
      accumulation,
      bucketWidth,
      countyTag: selectedCountyTag,
      pointSize,
      reviewRows,
      scaleMode,
      scope,
      turnoutRows,
    }),
    [accumulation, bucketWidth, pointSize, reviewRows, scaleMode, scope, selectedCountyTag, turnoutRows],
  );
  const histogramContext = useMemo(() => buildKlimekHistogramContext(fingerprint), [fingerprint]);
  const showHistogramContext = pointAppearance === "histogram_context";
  const issues = [
    fingerprint.referenceCandidate === null
      ? "The loaded Democratic and Republican comparison totals are tied or unavailable, so no winning candidate can be selected."
      : "",
    fingerprint.candidateOmittedObservationCount > 0
      ? `${formatCount(fingerprint.candidateOmittedObservationCount)} vote-share observations are omitted because a usable candidate percentage is unavailable.`
      : "",
    fingerprint.turnoutOmittedObservationCount > 0
      ? `${formatCount(fingerprint.turnoutOmittedObservationCount)} turnout observations are omitted because a usable turnout percentage is unavailable.`
      : "",
    scope !== "state_county" && (fingerprint.candidateIdentityMissingCount > 0 || fingerprint.turnoutIdentityMissingCount > 0)
      ? `${formatCount(fingerprint.candidateIdentityMissingCount)} vote-share and ${formatCount(fingerprint.turnoutIdentityMissingCount)} turnout observations lack an exact reporting-unit identity and are not joined by display name.`
      : "",
    fingerprint.ambiguousUnitCount > 0
      ? `${formatCount(fingerprint.ambiguousUnitCount)} reporting-unit identities are duplicated in an input and are omitted as ambiguous.`
      : "",
    fingerprint.candidateUnmatchedObservationCount > 0 || fingerprint.turnoutUnmatchedObservationCount > 0
      ? `${formatCount(fingerprint.candidateUnmatchedObservationCount)} vote-share and ${formatCount(fingerprint.turnoutUnmatchedObservationCount)} turnout observations do not have a compatible observation on the other axis.`
      : "",
    fingerprint.untaggedSourceRowCount > 0 && scope === "state_county"
      ? `${formatCount(fingerprint.untaggedSourceRowCount)} source rows lack a canonical county tag and are excluded from county rollups.`
      : "",
    fingerprint.pointWeightOmissionCount > 0
      ? `${formatCount(fingerprint.pointWeightOmissionCount)} matched observations lack the selected point-size or marginal vote weight.`
      : "",
    fingerprint.warningPointCount > 0
      ? `${formatCount(fingerprint.warningPointCount)} plotted turnout observations carry a denominator warning from the source pipeline.`
      : "",
    fingerprint.denominatorNotes.length > 1
      ? `This selection combines ${formatCount(fingerprint.denominatorNotes.length)} turnout denominator notes; confirm that the definitions are comparable.`
      : "",
    fingerprint.xOverflowPointCount > 0 || fingerprint.yOverflowPointCount > 0
      ? `${formatCount(fingerprint.xOverflowPointCount)} turnout and ${formatCount(fingerprint.yOverflowPointCount)} vote-share values exceed the selected axis domains; they remain in the final overflow buckets and at the chart boundary with exact values in their tooltips.`
      : "",
    fingerprint.points.length > 0 && fingerprint.points.length < 10
      ? "Fewer than 10 exactly matched sub-jurisdictions are drawable, so the fingerprint shape is fragile."
      : "",
  ].filter(Boolean);
  const status = fingerprint.points.length === 0 ? "blocked" : issues.length ? "partial" : "ready";
  const diagnosticKey = [
    stateCode,
    electionYear,
    scope,
    selectedCountyTag,
    accumulation,
    pointSize,
    bucketWidth,
    scaleMode,
    pointAppearance,
    fingerprint.referenceCandidate,
    fingerprint.points.length,
  ].join(":");
  const acknowledged = acknowledgedKeys.includes(diagnosticKey);
  const gated = status !== "ready" && !acknowledged;
  const scopeLabel = scope === "state_county"
    ? `${stateName} · ${pluralizeCountyLabel(countyLabel)}`
    : scope === "county_local"
      ? `${selectedCounty?.name ?? countyLabel} · local reporting units`
      : `${stateName} · local reporting units`;
  const unitLabel = scope === "state_county"
    ? pluralizeCountyLabel(countyLabel).toLowerCase()
    : fingerprint.levels.length === 1
      ? friendlyLevel(fingerprint.levels[0])
      : "local reporting units";
  const pointSizeLabel = pointSize === "winner_votes" ? "winner votes" : "total presidential votes";
  const marginalLabel = accumulation === "units" ? "sub-jurisdiction count" : "accumulated votes";
  const xTicks = percentageTicks({ max: fingerprint.xDomainMax, min: fingerprint.xDomainMin });
  const yTicks = percentageTicks({ max: fingerprint.yDomainMax, min: fingerprint.yDomainMin });
  const plot = { bottom: 474, height: 420, left: 82, right: 714, top: 54, width: 632 };
  const side = { left: 734, right: 966, width: 232 };
  const bottom = { bottom: 644, height: 148, top: 496 };
  const xDomainSpan = fingerprint.xDomainMax - fingerprint.xDomainMin;
  const yDomainSpan = fingerprint.yDomainMax - fingerprint.yDomainMin;
  const xPosition = (value: number) => plot.left + (
    (Math.min(fingerprint.xDomainMax, Math.max(fingerprint.xDomainMin, value)) - fingerprint.xDomainMin)
    / xDomainSpan
  ) * plot.width;
  const yPosition = (value: number) => plot.bottom - (
    (Math.min(fingerprint.yDomainMax, Math.max(fingerprint.yDomainMin, value)) - fingerprint.yDomainMin)
    / yDomainSpan
  ) * plot.height;
  const bottomSlot = plot.width / fingerprint.bottomBuckets.length;
  const sideSlot = plot.height / fingerprint.sideBuckets.length;
  const encodingSummary = showHistogramContext
    ? "Share bins: orange peak, white similar, green valley, gray unavailable. Turnout-bin peaks/valleys are opaque; similar bins are translucent."
    : "Color: loaded winner. Opacity: shared marginal-bucket density.";
  const chartSummary = `${scopeLabel}: ${fingerprint.referenceCandidateLabel} vote share by turnout, with aligned ${bucketWidth}-point marginal histograms on turnout ${fingerprint.xDomainMin}-${fingerprint.xDomainMax}% and vote-share ${fingerprint.yDomainMin}-${fingerprint.yDomainMax}% domains. ${encodingSummary}`;

  return (
    <article className="history-chart-card wide klimek-workbench" data-appearance={pointAppearance} data-tour="history-klimek">
      <div className="shpilkin-heading">
        <div>
          <strong>Klimek-Style Vote Fingerprint + Aligned Marginals</strong>
          <span>
            Exact turnout-versus-loaded-winner vote-share points, with the corresponding turnout histogram below and vote-share histogram beside them.
          </span>
        </div>
        <div className="shpilkin-heading-actions">
          <button
            className="secondary-button"
            disabled={gated || status === "blocked"}
            onClick={() => svgRef.current && downloadSvg(
              svgRef.current,
              `${stateCode.toLowerCase()}-${electionYear}-klimek-${scope}-${scaleMode}-${pointAppearance}-${bucketWidth}pct.svg`,
            )}
            type="button"
          >
            <Download aria-hidden size={15} />
            Download SVG
          </button>
          <Eli5>
            Each dot is one place. Left-to-right is turnout, up-and-down is the loaded winner&apos;s vote share, and dot size is vote volume. The two bar charts count the same dots along each axis.
          </Eli5>
        </div>
      </div>

      <div className="data-warning strong-warning" role="status">
        <TriangleAlert aria-hidden size={18} />
        <div>
          <strong>Descriptive screening view—not a finding</strong>
          <span>
            Dense bands or high-turnout/high-share points require denominator, ballot-accounting, source, and audit review. This chart does not establish fraud, tampering, misconduct, or intent.
          </span>
        </div>
      </div>

      <div className="shpilkin-controls" aria-label="Klimek fingerprint controls">
        <KlimekChoiceButtons
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
        <KlimekChoiceButtons
          label="Axis scale"
          onChange={setScaleMode}
          options={scaleModeOptions}
          value={scaleMode}
        />
        <KlimekChoiceButtons
          label="Point appearance"
          onChange={setPointAppearance}
          options={pointAppearanceOptions}
          value={pointAppearance}
        />
        <KlimekChoiceButtons
          label="Point size"
          onChange={setPointSize}
          options={pointSizeOptions}
          value={pointSize}
        />
        <KlimekChoiceButtons
          label="Marginal accumulation"
          onChange={setAccumulation}
          options={accumulationOptions}
          value={accumulation}
        />
        <KlimekChoiceButtons
          label="Marginal bucket width"
          onChange={setBucketWidth}
          options={klimekBucketWidths.map((width) => ({ key: width, label: `${width}%` }))}
          value={bucketWidth}
        />
      </div>

      {showHistogramContext ? (
        <div className="chart-scale-guidance" role="note">
          <strong>Histogram context, not an assessment of a place</strong>
          <span>
            Each bin is compared with the mean height of its two immediate neighbors using the selected accumulation and bucket width. White/translucent means within 10% of that local reference, not agreement with a normal distribution. Endpoints and overflow have no two-sided comparison. All points in a bin share its context; this is not a probability, significance test, or evidence of misconduct. Empty valleys remain visible in the marginal gaps, not as invented points.
          </span>
        </div>
      ) : null}

      <div className={`chart-scale-guidance ${scaleMode === "fit" ? "is-fitted" : ""}`} role="note">
        <strong>{scaleMode === "comparison" ? "Comparable 0%–100% scale" : "Zoomed, data-fitted scale"}</strong>
        <span>
          {scaleMode === "comparison"
            ? "Use this fixed domain on both axes for apples-to-apples comparisons between elections."
            : `This view fits turnout to ${fingerprint.xDomainMin}%–${fingerprint.xDomainMax}% and vote share to ${fingerprint.yDomainMin}%–${fingerprint.yDomainMax}% so clustered points spread out. Switch to 0%–100% before comparing elections.`}
        </span>
      </div>

      <div className={`chart-quality-notice ${status === "partial" ? "acknowledgement_required" : status}`} role="status">
        <div className="chart-quality-head">
          <div>
            <span>{status === "ready" ? "Ready" : status === "blocked" ? "Blocked" : "Partial"}</span>
            <strong>
              {status === "ready"
                ? "Every plotted point has compatible vote-share, turnout, identity, and size inputs."
                : status === "blocked"
                  ? "This selection has no exactly matched drawable fingerprint points."
                  : "The selected fingerprint has identity, source, or coverage limits to review."}
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
        {fingerprint.denominatorNotes.length ? (
          <details>
            <summary>Turnout denominator notes</summary>
            <ul>{fingerprint.denominatorNotes.map((note) => <li key={note}>{note}</li>)}</ul>
          </details>
        ) : null}
      </div>

      <dl className="shpilkin-stats klimek-stats">
        <div><dt>Exactly matched points</dt><dd>{formatCount(fingerprint.points.length)}</dd></div>
        <div>
          <dt>Loaded major-candidate winner</dt>
          <dd>{fingerprint.referenceCandidate ? fingerprint.referenceCandidateLabel : "Unavailable"}</dd>
        </div>
        <div><dt>Source datasets</dt><dd>{formatCount(fingerprint.sourceCount)}</dd></div>
        <div><dt>Marginal bucket width</dt><dd>{bucketWidth}%</dd></div>
        <div>
          <dt>Axis domains</dt>
          <dd>X {fingerprint.xDomainMin}%–{fingerprint.xDomainMax}% · Y {fingerprint.yDomainMin}%–{fingerprint.yDomainMax}%</dd>
        </div>
      </dl>

      <div className="klimek-legend" aria-label="Fingerprint encoding legend" role="note">
        {showHistogramContext ? (
          <>
            <span><i aria-hidden className="klimek-legend-dot" style={{ background: histogramContextColors.peak }} /> Share-bin peak</span>
            <span><i aria-hidden className="klimek-legend-dot" style={{ background: histogramContextColors.similar }} /> Similar to neighbors</span>
            <span><i aria-hidden className="klimek-legend-dot" style={{ background: histogramContextColors.valley }} /> Share-bin valley</span>
            <span><i aria-hidden className="klimek-legend-dot" style={{ background: histogramContextColors.unavailable }} /> Comparison unavailable</span>
          </>
        ) : <span><i aria-hidden className={`klimek-legend-dot ${fingerprint.referenceCandidate ?? "neutral"}`} /> Color: loaded winner</span>}
        <span>Size: {pointSizeLabel}</span>
        <span>{showHistogramContext ? "Opacity: turnout-bin peaks/valleys opaque; similar translucent; unavailable medium" : "Opacity: shared marginal-bucket density"}</span>
        <span>Bars: {marginalLabel}</span>
      </div>

      <div className={`screening-chart-shell ${gated ? "is-gated" : ""}`}>
        <div className="chart-gate-frame shpilkin-svg-frame klimek-svg-frame">
          {fingerprint.points.length > 0 ? (
            <svg
              aria-describedby={descriptionId}
              aria-hidden={gated}
              aria-labelledby={titleId}
              ref={svgRef}
              role="img"
              viewBox="0 0 1000 758"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title id={titleId}>{chartSummary}</title>
              <desc id={descriptionId}>
                {formatCount(fingerprint.points.length)} exactly matched {unitLabel}. Point placement uses exact turnout and winner vote-share percentages on turnout {fingerprint.xDomainMin}%-to-{fingerprint.xDomainMax}% and vote-share {fingerprint.yDomainMin}%-to-{fingerprint.yDomainMax}% axes; marginal bars use {bucketWidth}-percentage-point buckets.
                {encodingSummary} {showHistogramContext ? "Reference: immediate neighboring-bin mean, with a 10% visual tolerance. Not a normality or significance test; not an assessment of individual units or election conduct." : ""}
              </desc>
              <rect className="screening-svg-bg" height="758" width="1000" />
              <rect className="klimek-plot-bg" height={plot.height} width={plot.width} x={plot.left} y={plot.top} />
              {yTicks.map((tick) => (
                <g key={`y-${tick}`}>
                  <line className="screening-gridline" x1={plot.left} x2={plot.right} y1={yPosition(tick)} y2={yPosition(tick)} />
                  <text className="screening-axis-label" textAnchor="end" x={plot.left - 10} y={yPosition(tick) + 4}>{tick}%</text>
                </g>
              ))}
              {xTicks.map((tick) => (
                <g key={`x-${tick}`}>
                  <line className="shpilkin-x-gridline" x1={xPosition(tick)} x2={xPosition(tick)} y1={plot.top} y2={plot.bottom} />
                  <text className="screening-axis-label" textAnchor="middle" x={xPosition(tick)} y={plot.bottom + 18}>{tick}%</text>
                </g>
              ))}
              <text className="screening-title" x={plot.left} y="29">{scopeLabel} · {electionYear}</text>
              <text className="klimek-marginal-title" x={side.left} y="42">Winner-share marginal</text>
              <text className="klimek-marginal-title" x={plot.left} y={bottom.bottom + 24}>Turnout marginal · max {compactFormatter.format(fingerprint.maxBottomBucketValue)}</text>
              <text className="screening-axis-title vertical" transform={`translate(20 ${(plot.top + plot.bottom) / 2}) rotate(-90)`}>
                {fingerprint.referenceCandidateLabel} vote share
              </text>
              <text className="screening-axis-title centered" x={(plot.left + plot.right) / 2} y="694">Turnout percentage</text>
              {fingerprint.bottomBuckets.map((bucket, index) => {
                const height = fingerprint.maxBottomBucketValue > 0
                  ? (bucket.value / fingerprint.maxBottomBucketValue) * bottom.height
                  : 0;
                const x = plot.left + index * bottomSlot + Math.min(0.8, bottomSlot * 0.08);
                const width = Math.max(0.45, bottomSlot - Math.min(1.6, bottomSlot * 0.16));
                return (
                  <rect
                    className="klimek-marginal-bar turnout"
                    height={height}
                    key={`bottom-${bucket.low}`}
                    width={width}
                    x={x}
                    y={bottom.bottom - height}
                  >
                    <title>{`${bucket.label}: ${formatCount(bucket.value)} ${accumulation === "votes" ? "ballots cast" : "sub-jurisdictions"}; ${formatCount(bucket.unitCount)} plotted units${showHistogramContext ? `; ${describeHistogramBin(histogramContext.bottom[index])}` : ""}`}</title>
                  </rect>
                );
              })}
              {fingerprint.sideBuckets.map((bucket, index) => {
                const width = fingerprint.maxSideBucketValue > 0
                  ? (bucket.value / fingerprint.maxSideBucketValue) * side.width
                  : 0;
                const y = plot.bottom - (index + 1) * sideSlot + Math.min(0.8, sideSlot * 0.08);
                const height = Math.max(0.45, sideSlot - Math.min(1.6, sideSlot * 0.16));
                return (
                  <rect
                    className={`klimek-marginal-bar ${fingerprint.referenceCandidate ?? "neutral"}`}
                    height={height}
                    key={`side-${bucket.low}`}
                    style={showHistogramContext ? { fill: histogramContextColors[histogramContext.side[index].relation] } : undefined}
                    width={width}
                    x={side.left}
                    y={y}
                  >
                    <title>{`${bucket.label}: ${formatCount(bucket.value)} ${accumulation === "votes" ? "presidential votes" : "sub-jurisdictions"}; ${formatCount(bucket.unitCount)} plotted units${showHistogramContext ? `; ${describeHistogramBin(histogramContext.side[index])}` : ""}`}</title>
                  </rect>
                );
              })}
              <line className="fingerprint-axis" x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} />
              <line className="fingerprint-axis" x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.bottom} />
              <line className="fingerprint-axis" x1={plot.left} x2={plot.right} y1={bottom.top} y2={bottom.top} />
              <line className="fingerprint-axis" x1={side.left} x2={side.left} y1={plot.top} y2={plot.bottom} />
              {fingerprint.points.map((point) => {
                const context = showHistogramContext ? histogramContext.byPoint.get(point.id) : undefined;
                const radius = 3 + (fingerprint.maxPointSizeValue > 0
                  ? Math.sqrt(point.sizeValue / fingerprint.maxPointSizeValue) * 10
                  : 0);
                const overflow = point.turnoutPct > fingerprint.xDomainMax || point.winnerSharePct > fingerprint.yDomainMax;
                return (
                  <circle
                    className={`klimek-point ${fingerprint.referenceCandidate ?? "neutral"} ${overflow ? "overflow" : ""}`}
                    cx={xPosition(point.turnoutPct).toFixed(2)}
                    cy={yPosition(point.winnerSharePct).toFixed(2)}
                    data-density-score={point.densityScore.toFixed(4)}
                    key={point.id}
                    r={radius.toFixed(2)}
                    style={context
                      ? { fill: context.fill, fillOpacity: context.fillOpacity }
                      : { fillOpacity: 0.34 + point.densityScore * 0.58 }}
                  >
                    <title>
                      {`${point.label}: turnout ${point.turnoutPct.toFixed(2)}%; ${fingerprint.referenceCandidateLabel} ${point.winnerSharePct.toFixed(2)}%; total votes ${formatOptionalCount(point.totalVotes)}; winner votes ${formatOptionalCount(point.winnerVotes)}; point size ${formatCount(point.sizeValue)} ${pointSizeLabel}; marginal buckets ${bucketLabel(point.xBucketLow, point.turnoutPct, fingerprint.xDomainMax, bucketWidth)} turnout and ${bucketLabel(point.yBucketLow, point.winnerSharePct, fingerprint.yDomainMax, bucketWidth)} share${context ? `; share bin: ${describeHistogramBin(context.share)}; turnout bin: ${describeHistogramBin(context.turnout)}` : ""}`}
                    </title>
                  </circle>
                );
              })}
              <text className="klimek-marginal-max" textAnchor="end" x={side.right} y={plot.bottom + 17}>
                side max {compactFormatter.format(fingerprint.maxSideBucketValue)}
              </text>
              <text fill="#b8c5be" fontSize="10" x={plot.left} y="722">{encodingSummary}</text>
              <text fill="#b8c5be" fontSize="10" x={plot.left} y="742">
                {showHistogramContext ? "Reference: neighboring-bin mean; 10% visual tolerance. Not a normality test or evidence of misconduct." : "Descriptive screening view; not evidence of misconduct."}
              </text>
            </svg>
          ) : (
            <div className="empty-state compact shpilkin-empty">
              <strong>No exactly matched observations for this selection</strong>
              <span>
                A point needs candidate share, turnout percentage, vote-size data, and a shared canonical county tag or exact reporting-unit identity.
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
                ? "The current data do not support an exact turnout-to-vote-share intersection for this selection."
                : "This fingerprint has incomplete, warning-marked, or unmatched inputs. Review the listed limits before opening it."}
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
        <summary>How this fingerprint and its marginal histograms are calculated</summary>
        <p>
          The loaded major-candidate winner is determined inside the selected scope. Every point uses turnout percentage on the horizontal axis and that candidate&apos;s presidential vote share on the vertical axis. Point size uses either total presidential votes or votes for that candidate.
        </p>
        <p>
          Counties pair only through canonical county tags. Local units pair only when the normalized vote-share and turnout rows carry the same reporting-unit identity; display-name similarity is never treated as an identity crosswalk. The two marginal histograms aggregate only the points visible in the scatterplot, so their buckets align exactly with its axes.
        </p>
        <p>
          Bucket width affects the marginal bars and the point-opacity density cue, but it never moves or blurs a point. A two-dimensional heat-map transformation remains separate future work. The fixed 0%–100% domain is required for apples-to-apples comparisons between elections. Fit-visible-data mode adds padded, bucket-aligned zoom independently to each axis; it improves separation but must not be compared with a chart using different domains. Values outside the selected domain stay in the final overflow bucket, draw at the chart boundary, and retain their exact tooltip values.
        </p>
        <p>
          Histogram peaks / valleys is an optional local bar-height comparison. A bin is similar when its observed height differs from the mean of its immediate neighbors by at most 10% of the larger height. Otherwise it is a peak or valley relative to those neighbors. Share-bin context controls orange/white/green fill; turnout-bin context controls fixed opaque/translucent fill. Point positions, sizes, counts, and source identities never change. No normal-distribution assumption, skew/kurtosis amplification, fraud mechanism, or individual-unit inference is applied.
        </p>
      </details>
    </article>
  );
}
