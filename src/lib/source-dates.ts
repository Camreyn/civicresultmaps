/** Date-only records are displayed in UTC, never shifted by the reader's zone. */
export function formatSourceDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

export function sourceDateLabel(source: { publishedOn?: string | null; eventOn?: string | null }) {
  return source.publishedOn ? `Dated ${source.publishedOn}`
    : source.eventOn ? `Event ${source.eventOn} · Publication date unconfirmed` : "Undated";
}
