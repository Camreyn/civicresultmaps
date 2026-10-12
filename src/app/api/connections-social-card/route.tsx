import { ImageResponse } from "next/og";

// Fixed artwork: generated at build time, with no database, remote assets or user input.
export const dynamic = "force-static";

// Dated examples from the public documentary catalog, not operational telemetry.
// Sources: ap-networks, ap-openai, ap-kalshi, openai-oracle, kalshi-advisor.
const nodes = [
  { label: "ABC · CBS · CNN · NBC · Fox", left: 420, top: 8, width: 684, color: "#35c7a3" },
  { label: "OpenAI", left: 420, top: 126, width: 220, color: "#35c7a3" },
  { label: "Kalshi", left: 420, top: 244, width: 220, color: "#35c7a3" },
  { label: "Oracle", left: 884, top: 126, width: 220, color: "#82b8ff" },
  { label: "Donald Trump Jr.", left: 884, top: 244, width: 220, color: "#f0c36a" },
] as const;

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          padding: "32px 48px", background: "#101512", color: "#f4f1ea",
          fontFamily: "sans-serif", borderTop: "8px solid #35c7a3",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="40" height="40" viewBox="0 0 512 512">
            <path d="M261 253L397 331Q402 334 397 337L261 415Q256 418 251 415L115 337Q110 334 115 331L251 253Q256 250 261 253Z" fill="#35c7a3" />
            <path d="M261 173L397 251Q402 254 397 257L261 335Q256 338 251 335L115 257Q110 254 115 251L251 173Q256 170 261 173Z" fill="#ff8f7e" />
            <path d="M261 93L397 171Q402 174 397 177L261 255Q256 258 251 255L115 177Q110 174 115 171L251 93Q256 90 261 93Z" fill="#f4f1ea" />
            <path d="M179 174C217 119 295 119 333 174C295 229 217 229 179 174Z" fill="#061111" />
            <circle cx="256" cy="174" r="25" fill="#35c7a3" />
            <circle cx="256" cy="174" r="13" fill="#061111" />
            <circle cx="270" cy="160" r="7" fill="#f4f1ea" />
          </svg>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>Civic Result Maps</div>
          </div>
          <div style={{ display: "flex", color: "#a9bbb0", fontSize: 24 }}>Election Connections</div>
        </div>

        <div style={{ display: "flex", marginTop: 22, marginBottom: 26, fontSize: 46, fontWeight: 700, letterSpacing: -1 }}>
          AP&apos;s election-data customers &amp; their connections
        </div>

        <div style={{ display: "flex", position: "relative", width: 1104, height: 334 }}>
          <svg width="1104" height="334" viewBox="0 0 1104 334" style={{ position: "absolute", top: 0, left: 0 }}>
            <path d="M232 181H260M260 50V286M260 50H420M260 168H420M260 286H420" fill="none" stroke="#35c7a3" strokeWidth="3" />
            {[50, 168, 286].map((y) => <path key={y} d={`M411 ${y - 5}L420 ${y}L411 ${y + 5}`} fill="none" stroke="#35c7a3" strokeWidth="3" />)}
            {/* A capacity partnership is not an AP hosting or election-data route. */}
            <path d="M640 168H884" fill="none" stroke="#82b8ff" strokeWidth="3" strokeDasharray="8 5" />
            <path d="M884 286H640M649 281L640 286L649 291" fill="none" stroke="#f0c36a" strokeWidth="3" />
          </svg>
          <div style={{ display: "flex", position: "absolute", left: 0, top: 108, width: 232, height: 146, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, border: "2px solid #35c7a3", borderRadius: 12, background: "#1b3026" }}>
            <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>AP</div>
            <div style={{ display: "flex", fontSize: 23 }}>Associated Press</div>
          </div>
          {nodes.map((node) => (
            <div key={node.label} style={{ display: "flex", position: "absolute", left: node.left, top: node.top, width: node.width, height: 84, alignItems: "center", justifyContent: "center", border: `2px solid ${node.color}`, borderRadius: 12, background: "#202c24", color: node.color, fontSize: node.label === "Donald Trump Jr." ? 24 : 32, fontWeight: 700 }}>
              {node.label}
            </div>
          ))}
          {[
            { label: "Election results", date: "Ann. Oct 2025", top: 6 },
            { label: "Vote-count data", date: "Ann. May 2026", top: 124 },
            { label: "Data + race calls", date: "Ann. Mar 2026", top: 242 },
          ].map((edge) => (
            <div key={edge.label} style={{ display: "flex", position: "absolute", left: 266, top: edge.top, width: 150, flexDirection: "column", alignItems: "center", color: "#b5c3ba", fontSize: 16, lineHeight: 1.2 }}>
              <span>{edge.label}</span><span>{edge.date}</span>
            </div>
          ))}
          <div style={{ display: "flex", position: "absolute", left: 646, top: 124, width: 232, flexDirection: "column", alignItems: "center", color: "#82b8ff", fontSize: 18, lineHeight: 1.2 }}>
            <span>AI-capacity partnership</span><span>Ann. Jul 2025</span>
          </div>
          <div style={{ display: "flex", position: "absolute", left: 646, top: 180, width: 232, justifyContent: "center", color: "#b5c3ba", fontSize: 16 }}>AP hosting not established</div>
          <div style={{ display: "flex", position: "absolute", left: 646, top: 242, width: 232, flexDirection: "column", alignItems: "center", color: "#f0c36a", fontSize: 18, lineHeight: 1.2 }}>
            <span>Advisor appointment</span><span>Ann. Jan 2025</span>
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 10, color: "#b5c3ba", fontSize: 20 }}>
          Data agreements are not vote administration. Networks make independent race calls.
        </div>
        <div style={{ display: "flex", marginTop: "auto", justifyContent: "space-between", color: "#a9bbb0", fontSize: 18 }}>
          <span>civicresultmaps.org/connections</span>
          <span>Sources: AP, OpenAI, Kalshi · Announcement dates shown</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800" },
    },
  );
}
