import nyEquipment from "../../data/ny-2026-equipment.json" with { type: "json" };

// A separate administration snapshot: never add 2026 to the presidential result years.
export const midtermEquipment = nyEquipment;
export type MidtermEquipmentRow = (typeof nyEquipment.rows)[number];
export const midtermSource = (id: string) => nyEquipment.sources.find((source) => source.id === id)!;

export function filterMidtermEquipment(query: string, family: string) {
  const term = query.trim().toLowerCase();
  return nyEquipment.rows.filter((row) => (!family || row.family === family)
    && (!term || [row.county, row.fips, row.family, ...row.additionalEquipment.map((item) => item.family)]
      .some((value) => value.toLowerCase().includes(term))));
}

export function midtermEquipmentCsv() {
  const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const header = ["workspace_year", "election_date", "county", "fips", "jurisdiction_tag", "listed_system_family", "source_url", "source_section", "additional_role", "additional_source_url", "observed_at", "source_publication_date", "election_deployment_confirmed", "exact_models", "firmware", "pollbook", "notes", "caveat"];
  return [header, ...nyEquipment.rows.map((row) => [
    "2026", nyEquipment.electionDate, row.county, row.fips, row.jurisdictionTag, row.family,
    midtermSource(row.sourceId).url, row.sourceSection,
    row.additionalEquipment.length ? "Clear Ballot: central count/audit tool only" : "Not listed by this source",
    row.additionalEquipment.length ? midtermSource("clear-ballot").url : "",
    nyEquipment.observedAt, "Undated", "Not independently confirmed", "Not established", "Not established", "Not established",
    row.notes ?? "", nyEquipment.caveats.join(" "),
  ])].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
