import { notFound } from "next/navigation";
import type { ReviewRowSummary, TurnoutRowSummary } from "@/lib/types";
import { KlimekFingerprint } from "../klimek-fingerprint";

export const dynamic = "force-dynamic";
export const metadata = { robots: { follow: false, index: false }, title: "Synthetic chart test harness" };

export default function ChartTestHarness() {
  if (process.env.UI_LAYOUT_TEST_HARNESS !== "true" || process.env.VERCEL_ENV === "production") notFound();
  const shares = [61, 61, 61, 62, 63, 64, 65, 65, 66, 68, 70, 70];
  const reviewRows: ReviewRowSummary[] = shares.map((share, index) => ({
    id: `fixture-review-${index}`, state: "EX", electionYear: 2024,
    jurisdictionCode: "EX-COUNTY", jurisdictionName: "Synthetic County", jurisdictionTag: "county:01001",
    localUnit: `Synthetic unit ${index + 1}`, level: "precinct", reportingUnitId: `fixture-unit-${index}`,
    demCandidate: "Example A", repCandidate: "Example B", demVotes: share, repVotes: 100 - share,
    harrisVotes: share, trumpVotes: 100 - share, totalVotes: 100, demShare: share, repShare: 100 - share,
    harrisShare: share, trumpShare: 100 - share, demDropoff: null, repDropoff: null,
    metrics: {}, sourceId: "synthetic-fixture-not-election-data",
  }));
  const turnoutRows: TurnoutRowSummary[] = shares.map((_, index) => ({
    id: `fixture-turnout-${index}`, state: "EX", electionYear: 2024,
    jurisdictionCode: "EX-COUNTY", jurisdictionName: "Synthetic County", jurisdictionTag: "county:01001",
    level: "precinct", reportingUnitId: `fixture-unit-${index}`, ballotsCast: 110 + index,
    registeredVoters: 200, turnoutPct: (110 + index) / 2,
    denominatorNote: "Synthetic test denominator; not election data", warningRequired: index === 0,
    sourceId: "synthetic-fixture-not-election-data",
  }));
  return (
    <main style={{ margin: "24px auto", maxWidth: 1200, padding: 16 }}>
      <h1>Synthetic chart test harness — not election data</h1>
      <KlimekFingerprint countyLabel="County" electionYear={2024} reviewRows={reviewRows} stateCode="EX" stateName="Synthetic example" turnoutRows={turnoutRows} />
    </main>
  );
}
