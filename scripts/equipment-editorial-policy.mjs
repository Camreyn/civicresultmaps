export function assertEquipmentClaimSourceRevisionsReady({ claim, manifest, slug, targetState }) {
  const revisionById = new Map(
    manifest.sources.flatMap((source) => source.revisions.map((revision) => [revision.id, { source, revision }])),
  );
  const requiresCurrentReviewedSources = ["approved", "published"].includes(targetState);

  for (const revisionId of claim.editorial?.sourceRevisionIds ?? []) {
    const entry = revisionById.get(revisionId);
    if (!entry) throw new Error(`${slug} references unknown source revision ${revisionId}.`);
    if (entry.revision.archiveStatus !== "verified") {
      throw new Error(`${slug} cannot advance while ${revisionId} is ${entry.revision.archiveStatus}.`);
    }
    if (requiresCurrentReviewedSources && entry.source.currentReviewedRevisionId !== revisionId) {
      throw new Error(
        `${slug} cannot advance with stale source revision ${revisionId}; `
          + `the current reviewed revision is ${entry.source.currentReviewedRevisionId}.`,
      );
    }
  }
}
