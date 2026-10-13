import { ImageResponse } from "next/og";
import { newsBySlug, newsKinds } from "@/lib/news";

export function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug");
  const entry = slug ? newsBySlug(slug) : undefined;
  if (slug && !entry) return new Response("Brief not found", { status: 404 });
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
      padding: "52px 64px", background: "#101512", color: "#f4f1ea", borderTop: "10px solid #35c7a3", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", color: "#35c7a3", fontSize: 28 }}>Civic Result Maps · {entry ? newsKinds[entry.kind] : "News"}</div>
      <div style={{ display: "flex", fontSize: entry ? 54 : 66, fontWeight: 700, lineHeight: 1.15 }}>
        {entry?.title ?? "Election reporting. Source records. Site updates."}
      </div>
      <div style={{ display: "flex", fontSize: 26, color: "#b7c5bc", lineHeight: 1.4 }}>
        {entry ? `${entry.eventLabel} ${entry.eventOn} · Source-linked brief & evidence limits` : "Read the original sources and explore the related tools."}
      </div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } },
  );
}
