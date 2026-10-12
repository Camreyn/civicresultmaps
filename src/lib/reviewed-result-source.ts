import "server-only";
import type { PublicResearchDocument } from "./connection-research";
import { readResearchArtifact } from "./connection-research-artifacts";

const sources = new Map<string, Promise<unknown>>();
export async function reviewedResultSource(revision: PublicResearchDocument["revisions"][number]) {
  let value = sources.get(revision.sha256);
  if (!value) {
    if (sources.size >= 4) sources.delete(sources.keys().next().value!);
    value = readResearchArtifact({ ...revision, artifactPath: `connection-sources/${revision.sourceId}/${revision.sha256}/artifact` })
      .then((bytes) => JSON.parse(bytes.toString("utf8")) as unknown).catch((error) => { sources.delete(revision.sha256); throw error; });
    sources.set(revision.sha256, value);
  }
  return value;
}
