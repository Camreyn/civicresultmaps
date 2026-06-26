import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listElectronicIntegrityArtifacts, publicDataCacheHeaders, stateQuery, yearQuery } from "@/lib/api";
import type { ElectronicIntegrityArtifactStatus, ElectronicIntegrityArtifactType } from "@/lib/electronic-integrity-artifacts";

const statusValues = new Set<ElectronicIntegrityArtifactStatus>([
  "blocked",
  "candidate",
  "documented_exclusion",
  "loaded",
  "needs_data",
  "partial",
]);

const typeValues = new Set<ElectronicIntegrityArtifactType>([
  "audit_results",
  "ballot_images",
  "cast_vote_records",
  "certified_results",
  "chain_of_custody",
  "logic_accuracy",
  "reporting_unit_results",
  "tabulator_logs",
]);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const stateParam = params.get("state");
  const yearParam = params.get("year");
  const statusParam = params.get("status") as ElectronicIntegrityArtifactStatus | null;
  const typeParam = params.get("type") as ElectronicIntegrityArtifactType | null;
  const state = stateParam ? stateQuery.parse(stateParam) : undefined;
  const year = yearParam ? yearQuery.parse(yearParam) : 2024;
  const status = statusParam && statusValues.has(statusParam) ? statusParam : undefined;
  const type = typeParam && typeValues.has(typeParam) ? typeParam : undefined;
  const artifacts = listElectronicIntegrityArtifacts({ state, status, type, year });

  return NextResponse.json(
    apiEnvelope(artifacts, {
      caveat:
        "Electronic integrity artifacts track evidence availability and reconciliation status. Missing or anomalous evidence does not prove tampering; CVR, ballot-image, audit, and log records require source-specific interpretation.",
      state: state ?? null,
      status: status ?? null,
      type: type ?? null,
      year,
    }),
    { headers: publicDataCacheHeaders },
  );
}
