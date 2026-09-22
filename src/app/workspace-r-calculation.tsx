"use client";

import { Calculator, LoaderCircle, Play, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceRCalculationDefinitionV1 } from "@/lib/workspace-layout-v2";
import {
  workspaceContextChangeEvent,
  workspaceNavigationContextFromSearchParams,
  type WorkspaceNavigationContext,
} from "@/lib/workspace-navigation";
import {
  buildWorkspaceRCalculationInputs,
  normalizeWorkspaceRResult,
  WORKSPACE_R_RUNTIME_R_VERSION,
  WORKSPACE_R_RUNTIME_STARTUP_TIMEOUT_MS,
  WORKSPACE_R_RUNTIME_VERSION,
  type WorkspaceRCalculationInputs,
  type WorkspaceRDisplayResult,
  type WorkspaceRDisplayScalar,
} from "@/lib/workspace-r-calculation";
import {
  WORKSPACE_R_RUNTIME_MESSAGE_SCOPE,
  workspaceRRuntimeDocument,
} from "@/lib/workspace-r-runtime-document";
import type { ResultRow } from "@/lib/types";

export type WorkspaceRCalculationPageContext = {
  enabled: boolean;
  layoutManifestDigest: string;
  layoutRevisionId: string;
  results: ResultRow[];
};

type WorkspaceRCalculationProps = {
  calculation: WorkspaceRCalculationDefinitionV1;
  description?: string;
  navigationContext: WorkspaceNavigationContext;
  pageContext: WorkspaceRCalculationPageContext;
  title?: string;
};

type RunPhase = "idle" | "initializing" | "executing" | "success" | "error";

type ActiveRun = {
  contextKey: string;
  payload: {
    inputs: WorkspaceRCalculationInputs;
    source: string;
  };
  requestId: string;
  runtimeDocument: string;
};

type RunMetadata = {
  contextKey: string;
  runtimeVersion: string;
  versionR: string;
};

export function WorkspaceRCalculation({
  calculation,
  description,
  navigationContext,
  pageContext,
  title,
}: WorkspaceRCalculationProps) {
  const [currentNavigation, setCurrentNavigation] = useState(navigationContext);
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [phase, setPhase] = useState<RunPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WorkspaceRDisplayResult | null>(null);
  const [runMetadata, setRunMetadata] = useState<RunMetadata | null>(null);
  const [formulaDigest, setFormulaDigest] = useState("Calculating...");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const syncFromLocation = () => {
      setCurrentNavigation(workspaceNavigationContextFromSearchParams(
        new URL(window.location.href).searchParams,
        navigationContext,
      ));
    };
    syncFromLocation();
    window.addEventListener(workspaceContextChangeEvent, syncFromLocation);
    return () => window.removeEventListener(workspaceContextChangeEvent, syncFromLocation);
  }, [navigationContext]);

  useEffect(() => {
    let cancelled = false;
    setFormulaDigest("Calculating...");
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi?.subtle) {
      setFormulaDigest("Unavailable");
      return;
    }
    void cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(calculation.source))
      .then((digest) => {
        if (cancelled) return;
        setFormulaDigest(Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""));
      })
      .catch(() => {
        if (!cancelled) setFormulaDigest("Unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [calculation.source]);

  const inputs = useMemo(
    () => buildWorkspaceRCalculationInputs(pageContext.results, currentNavigation),
    [currentNavigation, pageContext.results],
  );
  const contextKey = useMemo(() => JSON.stringify(inputs.context), [inputs.context]);
  const resultIsStale = Boolean(runMetadata && runMetadata.contextKey !== contextKey);

  useEffect(() => {
    if (!activeRun) return;
    let sent = false;
    let timer = window.setTimeout(() => {
      setError(`The isolated R runtime did not finish loading within ${WORKSPACE_R_RUNTIME_STARTUP_TIMEOUT_MS / 1_000} seconds. No calculation was sent to Vercel.`);
      setPhase("error");
      setActiveRun(null);
    }, WORKSPACE_R_RUNTIME_STARTUP_TIMEOUT_MS);

    const replaceTimer = (duration: number, message: string) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setError(message);
        setPhase("error");
        setActiveRun(null);
      }, duration);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.origin !== "null") return;
      const message = event.data;
      if (!isRuntimeMessage(message)) return;
      if (message.type === "bridge-ready" && !sent) {
        sent = true;
        iframeRef.current?.contentWindow?.postMessage({
          payload: activeRun.payload,
          requestId: activeRun.requestId,
          scope: WORKSPACE_R_RUNTIME_MESSAGE_SCOPE,
          type: "run",
        }, "*");
        return;
      }
      if (message.requestId !== activeRun.requestId) return;
      if (message.type === "status" && message.stage === "initializing") {
        setPhase("initializing");
        return;
      }
      if (message.type === "status" && message.stage === "executing") {
        setPhase("executing");
        replaceTimer(
          calculation.timeoutMs,
          `The R formula exceeded its ${calculation.timeoutMs.toLocaleString()} ms limit. The isolated runtime was destroyed.`,
        );
        return;
      }
      if (message.type === "result") {
        window.clearTimeout(timer);
        try {
          setResult(normalizeWorkspaceRResult(message.output));
          setRunMetadata({
            contextKey: activeRun.contextKey,
            runtimeVersion: String(message.runtimeVersion || WORKSPACE_R_RUNTIME_VERSION).slice(0, 40),
            versionR: String(message.versionR || WORKSPACE_R_RUNTIME_R_VERSION).slice(0, 40),
          });
          setError(null);
          setPhase("success");
        } catch (normalizationError) {
          setError(normalizationError instanceof Error ? normalizationError.message : "The R result could not be displayed.");
          setPhase("error");
        }
        setActiveRun(null);
        return;
      }
      if (message.type === "error") {
        window.clearTimeout(timer);
        setError(String(message.message || "The R formula failed.").slice(0, 1_000));
        setPhase("error");
        setActiveRun(null);
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
  }, [activeRun, calculation.timeoutMs]);

  const run = () => {
    if (!pageContext.enabled) return;
    const cryptoApi = globalThis.crypto;
    const requestId = typeof cryptoApi?.randomUUID === "function"
      ? cryptoApi.randomUUID()
      : `r-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      setError(null);
      setResult(null);
      setRunMetadata(null);
      setPhase("initializing");
      setActiveRun({
        contextKey,
        payload: { inputs, source: calculation.source },
        requestId,
        runtimeDocument: workspaceRRuntimeDocument(window.location.origin),
      });
    } catch (runtimeError) {
      setError(runtimeError instanceof Error ? runtimeError.message : "The isolated R runtime could not start.");
      setPhase("error");
    }
  };

  const running = phase === "initializing" || phase === "executing";
  return (
    <>
      <header className="workspace-r-heading">
        <span aria-hidden className="workspace-r-icon"><Calculator size={18} /></span>
        <div>
          <h2>{title || "Browser R calculation"}</h2>
          {description && <p>{description}</p>}
        </div>
      </header>

      <div aria-live="polite" className="workspace-r-output">
        {result && <RResult result={result} />}
        {!result && !error && !running && <p>No calculation has run in this browser yet.</p>}
        {running && <p className="workspace-r-status"><LoaderCircle aria-hidden className="workspace-r-spin" size={17} /> {phase === "initializing" ? "Loading the isolated R/WebAssembly runtime..." : "Running the formula in this browser..."}</p>}
        {error && <p className="workspace-r-error" role="alert"><TriangleAlert aria-hidden size={17} /> {error}</p>}
        {resultIsStale && <p className="workspace-r-stale" role="status">The viewed geography or mode changed after this result was calculated. Run again to use the current variables.</p>}
      </div>

      <div className="workspace-r-actions">
        {pageContext.enabled
          ? <button disabled={running} onClick={run} type="button">{running ? <LoaderCircle aria-hidden className="workspace-r-spin" size={16} /> : <Play aria-hidden size={16} />} {running ? "Running..." : "Run calculation"}</button>
          : <p><TriangleAlert aria-hidden size={16} /> Browser R calculations are disabled for this deployment.</p>}
        <span><ShieldCheck aria-hidden size={15} /> Runs in an isolated browser frame; no calculation request is sent to Vercel.</span>
      </div>

      <details className="workspace-r-proof">
        <summary>Proof-check formula and current variables</summary>
        <div className="workspace-r-proof-body">
          <dl>
            <div><dt>State</dt><dd>{inputs.context.state}</dd></div>
            <div><dt>Year</dt><dd>{inputs.context.year}</dd></div>
            <div><dt>Tab</dt><dd>{inputs.context.tab}</dd></div>
            <div><dt>Viewed FIPS</dt><dd>{inputs.context.fips ?? "All loaded rows"}</dd></div>
            <div><dt>Map mode</dt><dd>{inputs.context.mode ?? "Not set"}</dd></div>
            <div><dt>Formula limit</dt><dd>{calculation.timeoutMs.toLocaleString()} ms</dd></div>
            <div><dt>Input size</dt><dd>{inputs.context.inputBytes.toLocaleString()} / {inputs.context.inputByteLimit.toLocaleString()} bytes</dd></div>
          </dl>
          <h3>Dedicated R variables</h3>
          <ul className="workspace-r-variables">
            <li><code>crm_context</code><span>Named list for the current state, year, tab, FIPS, mode, row counts, and truncation status.</span></li>
            <li><code>crm_results</code><span>{inputs.context.resultRowCount.toLocaleString()} loaded result rows for this state and year.</span></li>
            <li><code>crm_view_results</code><span>{inputs.context.viewResultRowCount.toLocaleString()} rows matching the currently viewed FIPS, or all rows when no FIPS is selected.</span></li>
            <li><code>crm_votes</code><span>{inputs.context.voteRowCount.toLocaleString()} candidate-vote rows in long form.</span></li>
            <li><code>crm_view_votes</code><span>{inputs.context.viewVoteRowCount.toLocaleString()} candidate-vote rows matching the current view.</span></li>
          </ul>
          {inputs.context.inputTruncated && <p className="workspace-r-stale">A browser input safety cap was reached; <code>crm_context$inputTruncated</code> is TRUE. {inputs.context.truncatedStringCount > 0 ? `${inputs.context.truncatedStringCount.toLocaleString()} input string(s) were shortened.` : ""}</p>}
          <h3>R formula</h3>
          <pre><code>{calculation.source}</code></pre>
          <dl className="workspace-r-integrity">
            <div><dt>Input contract</dt><dd><code>{calculation.input}</code></dd></div>
            <div><dt>Formula SHA-256</dt><dd><code>{formulaDigest}</code></dd></div>
            <div><dt>Layout revision</dt><dd><code>{pageContext.layoutRevisionId}</code></dd></div>
            <div><dt>Manifest SHA-256</dt><dd><code>{pageContext.layoutManifestDigest}</code></dd></div>
            <div><dt>Runtime</dt><dd>webR {runMetadata?.runtimeVersion ?? WORKSPACE_R_RUNTIME_VERSION}; R {runMetadata?.versionR ?? WORKSPACE_R_RUNTIME_R_VERSION}</dd></div>
          </dl>
          <p className="workspace-r-runtime-note">The first run downloads the npm-pinned, self-hosted R/WebAssembly runtime. Later runs may use the browser cache. Formula changes require a new admin layout revision.</p>
        </div>
      </details>

      {activeRun && (
        <iframe
          aria-hidden="true"
          className="workspace-r-runtime-frame"
          ref={iframeRef}
          referrerPolicy="no-referrer"
          sandbox="allow-scripts"
          srcDoc={activeRun.runtimeDocument}
          tabIndex={-1}
          title="Isolated R calculation runtime"
        />
      )}
    </>
  );
}

function isRuntimeMessage(value: unknown): value is Record<string, unknown> & {
  requestId?: string;
  scope: string;
  stage?: string;
  type: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  if (message.scope !== WORKSPACE_R_RUNTIME_MESSAGE_SCOPE || typeof message.type !== "string") return false;
  if (!["bridge-ready", "error", "result", "status"].includes(message.type)) return false;
  if (message.type === "bridge-ready") return true;
  return typeof message.requestId === "string" && message.requestId.length <= 128;
}

function RResult({ result }: { result: WorkspaceRDisplayResult }) {
  if (result.kind === "metric") {
    return (
      <article className="workspace-r-metric">
        <span>{result.label}</span>
        <strong>{formatScalar(result.value)}</strong>
        {result.detail && <small>{result.detail}</small>}
      </article>
    );
  }
  if (result.kind === "scalar") return <p className="workspace-r-scalar">{formatScalar(result.value)}</p>;
  if (result.kind === "object") {
    return (
      <dl className="workspace-r-object">
        {result.entries.map((entry, index) => <div key={`${entry.label}-${index}`}><dt>{entry.label}</dt><dd>{formatScalar(entry.value)}</dd></div>)}
        {result.truncated && <div><dt>Output</dt><dd>Additional values were truncated.</dd></div>}
      </dl>
    );
  }
  if (result.kind === "vector") {
    return (
      <ol className="workspace-r-vector">
        {result.values.map((value, index) => <li key={index}>{result.names?.[index] && <span>{result.names[index]}</span>}<strong>{formatScalar(value)}</strong></li>)}
        {result.truncated && <li>Additional values were truncated.</li>}
      </ol>
    );
  }
  return (
    <div className="workspace-r-table-wrap">
      <table>
        <thead><tr>{result.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, columnIndex) => <td key={`${rowIndex}-${result.columns[columnIndex]}`}>{formatScalar(value)}</td>)}</tr>)}</tbody>
      </table>
      {result.truncated && <p>Additional rows or columns were truncated for display.</p>}
    </div>
  );
}

function formatScalar(value: WorkspaceRDisplayScalar) {
  if (value === null) return "NA";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString() : String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return value;
}
