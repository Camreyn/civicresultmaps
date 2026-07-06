import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import {
  buildStateSocialPreview,
  socialPreviewCaveat,
  socialPreviewYear,
} from "@/lib/social-preview";

export const dynamic = "force-dynamic";

const size = {
  width: 1200,
  height: 630,
};

function parseYear(value: string | null) {
  const year = Number(value ?? socialPreviewYear);
  return Number.isInteger(year) && year >= 1788 && year <= 2100 ? year : socialPreviewYear;
}

function metricRows(metrics: Awaited<ReturnType<typeof buildStateSocialPreview>>["metrics"]) {
  return metrics.filter((metric) => metric.value !== "0").slice(0, 6);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const preview = await buildStateSocialPreview({
    state: params.get("state") ?? undefined,
    year: parseYear(params.get("year")),
  });
  const rows = metricRows(preview.metrics);

  const response = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f6f2ea",
          color: "#16201f",
          padding: "52px 60px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  background: "#0f766e",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  fontSize: 22,
                  fontWeight: 800,
                }}
              >
                CRM
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ fontSize: 24, fontWeight: 800 }}>Civic Result Maps</div>
                <div style={{ fontSize: 18, color: "#53605d" }}>Public election data explorer</div>
              </div>
            </div>
            <div style={{ fontSize: 28, color: "#0f766e", fontWeight: 800, letterSpacing: 0 }}>
              {preview.year} President
            </div>
          </div>
          <div
            style={{
              border: "2px solid #c84a31",
              borderRadius: 8,
              color: "#9f321f",
              fontSize: 28,
              fontWeight: 800,
              padding: "12px 18px",
            }}
          >
            {preview.stateCode}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1.04, maxWidth: 980 }}>
            {preview.stateName}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {rows.map((metric) => (
              <div
                key={metric.label}
                style={{
                  width: 340,
                  height: 92,
                  border: "1px solid #d8d0c2",
                  borderRadius: 8,
                  background: "#fffaf1",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  padding: "0 22px",
                }}
              >
                <div style={{ fontSize: 20, color: "#5c6764" }}>{metric.label}</div>
                <div style={{ fontSize: 34, fontWeight: 900 }}>{metric.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            borderTop: "1px solid #d8d0c2",
            paddingTop: 18,
            color: "#4c5855",
            display: "flex",
            justifyContent: "space-between",
            gap: 28,
            fontSize: 20,
            lineHeight: 1.25,
          }}
        >
          <div style={{ maxWidth: 840 }}>{socialPreviewCaveat}</div>
          <div style={{ fontWeight: 800, color: "#0f766e" }}>civicresultmaps.org</div>
        </div>
      </div>
    ),
    size,
  );

  response.headers.set("Cache-Control", "public, max-age=0, s-maxage=900, stale-while-revalidate=86400");
  response.headers.set("CDN-Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");
  response.headers.set("Vercel-CDN-Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");

  return response;
}
