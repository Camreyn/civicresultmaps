import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LayoutEditorV4 } from "../admin/layout/layout-editor-v4";
import { WorkspaceRCalculation } from "../workspace-r-calculation";
import type { WorkspaceRCalculationDefinitionV1 } from "@/lib/workspace-layout-v2";
import type { ResultRow } from "@/lib/types";
import { embeddedWorkspaceLayoutManifestV3 } from "@/lib/workspace-layout-v3";
import styles from "../admin/layout/layout-editor.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Workspace Builder Test Harness",
};

const rCalculation = {
  input: "workspace-results-v1",
  source: `list(
  label = "Current-view vote total",
  value = sum(crm_view_results$totalVotes),
  detail = paste(nrow(crm_view_results), "result row(s)")
)`,
  timeoutMs: 2_500,
  version: 1,
} satisfies WorkspaceRCalculationDefinitionV1;

const rTimeoutCalculation = {
  input: "workspace-results-v1",
  source: "while (TRUE) {}",
  timeoutMs: 1_000,
  version: 1,
} satisfies WorkspaceRCalculationDefinitionV1;

const rNetworkIsolationCalculation = {
  input: "workspace-results-v1",
  source: `local({
  blocked <- webr::eval_js(
    "(() => { try { const xhr = new XMLHttpRequest(); xhr.open('GET', '/api/states', false); xhr.send(); return 0; } catch (_) { return 1; } })()"
  )
  list(
    label = "Same-origin API request blocked",
    value = blocked,
    detail = "1 means the isolated runtime could not reach /api."
  )
})`,
  timeoutMs: 2_500,
  version: 1,
} satisfies WorkspaceRCalculationDefinitionV1;

const rCalculationResults = [
  {
    jurisdictionCode: "53033",
    jurisdictionName: "King County",
    jurisdictionTag: "county:53033",
    level: "county",
    marginPct: 20,
    marginVotes: 20,
    office: "US President",
    sourceId: "layout-harness",
    state: "WA",
    totalVotes: 100,
    votes: { "Candidate A": 60, "Candidate B": 40 },
    winner: "Candidate A",
    year: 2024,
  },
  {
    jurisdictionCode: "53061",
    jurisdictionName: "Snohomish County",
    jurisdictionTag: "county:53061",
    level: "county",
    marginPct: 10,
    marginVotes: 5,
    office: "US President",
    sourceId: "layout-harness",
    state: "WA",
    totalVotes: 50,
    votes: { "Candidate A": 25, "Candidate B": 25 },
    winner: "Tie",
    year: 2024,
  },
] satisfies ResultRow[];

const rCalculationNavigation = { fips: "53033", mode: "margin", state: "WA", tab: "map", year: 2024 } as const;

export default function LayoutTestHarnessPage() {
  if (process.env.UI_LAYOUT_TEST_HARNESS !== "true" || process.env.VERCEL_ENV === "production") {
    notFound();
  }
  const rCalculationPageContext = {
    enabled: process.env.WORKSPACE_R_CALCULATIONS_ENABLED === "true",
    layoutManifestDigest: "harness-manifest-digest",
    layoutRevisionId: "harness-revision",
    results: rCalculationResults,
  };

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p>Local test harness</p>
          <h1>Workspace builder v4</h1>
          <span>Server mutations are disabled. This route returns 404 unless UI_LAYOUT_TEST_HARNESS=true and never runs in production.</span>
        </div>
        <div className={styles.statusRow}><span>Schema v3</span><span>Test mode</span></div>
      </header>
      <LayoutEditorV4
        assets={[]}
        baseManifest={embeddedWorkspaceLayoutManifestV3}
        builderV4Enabled
        drafts={[]}
        groupTemplates={[]}
        parentRevisionId={null}
        publications={[]}
        publisherEnabled={false}
        requestKey={randomUUID()}
        revisions={[]}
        templates={[]}
        testMode
      />
      <section aria-label="Browser R runtime harness" className="workspace-tabs">
        <section className="workspace-custom-block workspace-custom-r-calculation" data-layout-surface="panel">
          <WorkspaceRCalculation
            calculation={rCalculation}
            description="Local-only fixture for verifying the isolated browser runtime and proof panel."
            navigationContext={rCalculationNavigation}
            pageContext={rCalculationPageContext}
            title="Browser R calculation test"
          />
        </section>
      </section>
      <section aria-label="Browser R timeout harness" className="workspace-tabs">
        <section className="workspace-custom-block workspace-custom-r-calculation" data-layout-surface="panel">
          <WorkspaceRCalculation
            calculation={rTimeoutCalculation}
            description="Local-only fixture for verifying that timeout removes the entire execution frame."
            navigationContext={rCalculationNavigation}
            pageContext={rCalculationPageContext}
            title="Browser R timeout test"
          />
        </section>
      </section>
      <section aria-label="Browser R network isolation harness" className="workspace-tabs">
        <section className="workspace-custom-block workspace-custom-r-calculation" data-layout-surface="panel">
          <WorkspaceRCalculation
            calculation={rNetworkIsolationCalculation}
            description="Local-only adversarial fixture for verifying that formula code cannot reach application APIs."
            navigationContext={rCalculationNavigation}
            pageContext={rCalculationPageContext}
            title="Browser R network isolation test"
          />
        </section>
      </section>
      <section aria-label="Browser R disabled harness" className="workspace-tabs">
        <section className="workspace-custom-block workspace-custom-r-calculation" data-layout-surface="panel">
          <WorkspaceRCalculation
            calculation={rCalculation}
            description="Local-only fixture for verifying fail-closed deployment behavior."
            navigationContext={rCalculationNavigation}
            pageContext={{ ...rCalculationPageContext, enabled: false }}
            title="Browser R disabled test"
          />
        </section>
      </section>
    </main>
  );
}
