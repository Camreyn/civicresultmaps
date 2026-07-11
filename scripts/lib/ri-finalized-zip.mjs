import JSZip from "jszip";

export async function readFinalizedRootEntry(zipBytes, finalizedEntryName, sourceLabel = "RI result archive") {
  if (!finalizedEntryName || /[\\/]/u.test(finalizedEntryName)) {
    throw new Error(`Finalized RI result entry must be an explicit root member for ${sourceLabel}`);
  }

  const zip = await JSZip.loadAsync(zipBytes);
  const entry = zip.file(finalizedEntryName);
  const originalName = entry?.unsafeOriginalName ?? entry?.name;
  if (
    !entry
    || entry.dir
    || entry.name !== finalizedEntryName
    || originalName !== finalizedEntryName
  ) {
    throw new Error(`Could not find safe finalized root result entry ${finalizedEntryName} in ${sourceLabel}`);
  }

  return entry.async("string");
}
