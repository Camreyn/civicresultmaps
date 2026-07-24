import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import {
  buildEquipmentIndexSocialPreview,
  buildEquipmentMachineSocialPreview,
  buildEquipmentStateSocialPreview,
  type EquipmentMachineSocialPreview,
  type EquipmentNetworkPreviewStatus,
  type EquipmentStateSocialPreview,
} from "@/lib/equipment-social-preview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const size = { width: 1200, height: 630 };
const colors = {
  background: "#071619",
  card: "#0d2427",
  cardDark: "#091d20",
  border: "#274548",
  text: "#edf8f6",
  muted: "#9db9b6",
  accent: "#67d9cc",
  optional: "#f0c36a",
  context: "#9db9b6",
};

function BrandMark() {
  return (
    <svg height="42" viewBox="0 0 512 512" width="42">
      <path d="M 261 253 L 397 331 Q 402 334 397 337 L 261 415 Q 256 418 251 415 L 115 337 Q 110 334 115 331 L 251 253 Q 256 250 261 253 Z" fill="#35c7a3" opacity="0.92" />
      <path d="M 261 173 L 397 251 Q 402 254 397 257 L 261 335 Q 256 338 251 335 L 115 257 Q 110 254 115 251 L 251 173 Q 256 170 261 173 Z" fill="#ff8f7e" opacity="0.96" />
      <path d="M 261 93 L 397 171 Q 402 174 397 177 L 261 255 Q 256 258 251 255 L 115 177 Q 110 174 115 171 L 251 93 Q 256 90 261 93 Z" fill="#f4f1ea" />
      <path d="M 179 174 C 217 119 295 119 333 174 C 295 229 217 229 179 174 Z" fill="#061111" />
      <circle cx="256" cy="174" fill="#35c7a3" r="25" />
      <circle cx="256" cy="174" fill="#061111" r="13" />
      <circle cx="270" cy="160" fill="#f4f1ea" r="7" />
    </svg>
  );
}

function BrandHeader({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
      <div
        style={{
          width: 48,
          height: 48,
          border: `1px solid ${colors.border}`,
          borderRadius: 10,
          background: colors.card,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <BrandMark />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", color: colors.text, fontSize: 22, fontWeight: 900 }}>Civic Result Maps</div>
        <div style={{ display: "flex", color: colors.muted, fontSize: 14 }}>{label}</div>
      </div>
    </div>
  );
}

function statusColors(status: EquipmentNetworkPreviewStatus) {
  if (status === "optional") {
    return { background: "rgba(240,195,106,0.13)", border: "#715f38", text: colors.optional };
  }
  if (status === "documented") {
    return { background: "rgba(103,217,204,0.12)", border: "#356d69", text: colors.accent };
  }
  return { background: "rgba(157,185,182,0.08)", border: colors.border, text: "#bdd0ce" };
}

function NetworkPill({
  label,
  status,
}: {
  label: string;
  status: EquipmentNetworkPreviewStatus;
}) {
  const palette = statusColors(status);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 11px",
        border: `1px solid ${palette.border}`,
        borderRadius: 999,
        background: palette.background,
        color: palette.text,
        fontSize: 14,
        fontWeight: 800,
      }}
    >
      <div style={{ display: "flex", width: 8, height: 8, borderRadius: 999, background: palette.text }} />
      {label}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        minWidth: 142,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "12px 14px",
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        background: colors.cardDark,
      }}
    >
      <div style={{ display: "flex", color: colors.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ display: "flex", color: colors.text, fontSize: 20, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function machineCard(preview: EquipmentMachineSocialPreview, origin: string) {
  const imageUrl = preview.referenceImage
    ? new URL(preview.referenceImage.assetUrl, origin).toString()
    : null;
  const palette = statusColors(preview.network.status);
  const response = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          padding: "38px 44px",
          display: "flex",
          gap: 30,
          background: colors.background,
          color: colors.text,
          fontFamily: "Geist, Inter, Segoe UI, Arial, sans-serif",
        }}
      >
        <div style={{ width: 700, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 25 }}>
            <BrandHeader label="Source-linked U.S. election equipment" />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", color: colors.accent, fontSize: 17, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Equipment dossier
              </div>
              <div style={{ display: "flex", fontSize: 42, fontWeight: 900, lineHeight: 1.04, letterSpacing: "-0.035em" }}>
                {preview.displayName}
              </div>
              <div style={{ display: "flex", color: colors.muted, fontSize: 20, lineHeight: 1.32 }}>
                {preview.deviceRole}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Fact label="Components" value={String(preview.componentCount)} />
              <Fact label="Change records" value={String(preview.changeRecordCount)} />
              <Fact label="Sources" value={String(preview.sourceCount)} />
              <Fact label="System" value={preview.systemVersion} />
            </div>
          </div>
          <div style={{ display: "flex", color: colors.muted, fontSize: 14, lineHeight: 1.35 }}>
            Certified and test documentation is not a live inspection or proof of a jurisdiction's field configuration.
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            padding: 16,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            background: colors.card,
          }}
        >
          {imageUrl ? (
            <div
              style={{
                height: 244,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                borderRadius: 11,
                background: "#e9eceb",
              }}
            >
              <img
                alt={preview.referenceImage?.alt ?? ""}
                height="244"
                src={imageUrl}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
          ) : null}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "3px 2px 1px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", color: colors.muted, fontSize: 12, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase" }}>
                Networking in the reviewed dossier
              </div>
              <div style={{ display: "flex" }}>
                <NetworkPill label={preview.network.shortLabel} status={preview.network.status} />
              </div>
              <div style={{ display: "flex", color: colors.text, fontSize: 16, fontWeight: 800, lineHeight: 1.32 }}>
                {preview.network.label}
              </div>
              <div style={{ display: "flex", color: colors.muted, fontSize: 13, lineHeight: 1.35 }}>
                {preview.network.detail}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                paddingTop: 10,
                borderTop: `1px solid ${palette.border}`,
                color: palette.text,
                fontSize: 12,
                lineHeight: 1.3,
              }}
            >
              {preview.network.caveat}
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
  return setCache(response);
}

function stateCard(preview: EquipmentStateSocialPreview) {
  const response = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          padding: "34px 42px 30px",
          display: "flex",
          flexDirection: "column",
          background: colors.background,
          color: colors.text,
          fontFamily: "Geist, Inter, Segoe UI, Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 30 }}>
          <BrandHeader label="2024 source-linked equipment records" />
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Fact label="Tracked dossiers" value={String(preview.systems.length)} />
            <Fact label="Named families" value={String(preview.namedFamilySystemCount)} />
            <Fact label="Source records" value={String(preview.sourceCount)} />
          </div>
        </div>

        <div style={{ marginTop: 18, marginBottom: 14, display: "flex", alignItems: "baseline", gap: 13 }}>
          <div style={{ display: "flex", color: colors.accent, fontSize: 22, fontWeight: 900 }}>{preview.stateCode}</div>
          <div style={{ display: "flex", fontSize: 38, fontWeight: 900, letterSpacing: "-0.035em" }}>{preview.stateName} equipment records</div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
          {preview.systems.map((system) => {
            const exactFamily = system.usage.deviceFamilyRecords > 0;
            return (
              <div
                key={system.slug}
                style={{
                  minHeight: 62,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "9px 13px",
                  border: `1px solid ${colors.border}`,
                  borderLeft: `4px solid ${exactFamily ? colors.accent : colors.context}`,
                  borderRadius: 10,
                  background: colors.card,
                }}
              >
                <div style={{ width: 356, display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ display: "flex", color: colors.text, fontSize: 18, fontWeight: 900 }}>{system.deviceName}</div>
                  <div style={{ display: "flex", color: colors.muted, fontSize: 12 }}>{system.manufacturer}</div>
                </div>
                <div style={{ width: 254, display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ display: "flex", color: exactFamily ? colors.accent : "#c1d1cf", fontSize: 13, fontWeight: 850 }}>
                    {system.evidenceShortLabel}
                  </div>
                  <div style={{ display: "flex", color: colors.muted, fontSize: 11 }}>{system.evidenceLabel}</div>
                </div>
                <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                  <NetworkPill label={system.network.shortLabel} status={system.network.status} />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
          <div style={{ display: "flex", maxWidth: 850, color: colors.muted, fontSize: 12, lineHeight: 1.28 }}>{preview.caveat}</div>
          <div style={{ display: "flex", color: colors.accent, fontSize: 13, fontWeight: 850 }}>civicresultmaps.org/equipment</div>
        </div>
      </div>
    ),
    size,
  );
  return setCache(response);
}

function indexCard() {
  const preview = buildEquipmentIndexSocialPreview();
  const response = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          padding: "38px 44px",
          display: "flex",
          flexDirection: "column",
          background: colors.background,
          color: colors.text,
          fontFamily: "Geist, Inter, Segoe UI, Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <BrandHeader label="Source-linked U.S. election equipment" />
          <div style={{ display: "flex", gap: 9 }}>
            <Fact label="Dossiers" value={String(preview.systems.length)} />
            <Fact label="Network capability" value={String(preview.documentedCount)} />
            <Fact label="Optional networking" value={String(preview.optionalCount)} />
          </div>
        </div>
        <div style={{ marginTop: 21, display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ display: "flex", fontSize: 42, fontWeight: 900, letterSpacing: "-0.04em" }}>U.S. Election Equipment Explorer</div>
          <div style={{ display: "flex", color: colors.muted, fontSize: 18 }}>
            Certified-configuration quick facts, components, change records, networking evidence, and jurisdiction context.
          </div>
        </div>
        <div style={{ flex: 1, marginTop: 20, display: "flex", flexWrap: "wrap", gap: 10 }}>
          {preview.systems.map((system) => (
            <div
              key={system.slug}
              style={{
                width: 547,
                height: 104,
                padding: "13px 15px",
                border: `1px solid ${colors.border}`,
                borderRadius: 12,
                background: colors.card,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", color: colors.text, fontSize: 19, fontWeight: 900 }}>{system.deviceName}</div>
                <div style={{ display: "flex", color: colors.muted, fontSize: 12 }}>{system.systemName} {system.systemVersion}</div>
              </div>
              <div style={{ display: "flex" }}>
                <NetworkPill label={system.network.shortLabel} status={system.network.status} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", color: colors.muted, fontSize: 12 }}>
          Network capability in a reviewed dossier does not prove a jurisdiction connected, enabled, configured, or used it.
        </div>
      </div>
    ),
    size,
  );
  return setCache(response);
}

function setCache(response: ImageResponse) {
  response.headers.set("Cache-Control", "public, max-age=0, s-maxage=900, stale-while-revalidate=86400");
  response.headers.set("CDN-Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");
  response.headers.set("Vercel-CDN-Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");
  return response;
}

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (slug) {
    const preview = buildEquipmentMachineSocialPreview(slug);
    if (!preview) return new Response("Equipment dossier not found", { status: 404 });
    return machineCard(preview, request.nextUrl.origin);
  }

  const state = request.nextUrl.searchParams.get("state");
  if (state) {
    const preview = buildEquipmentStateSocialPreview(state);
    if (!preview) return new Response("Tracked state equipment not found", { status: 404 });
    return stateCard(preview);
  }

  return indexCard();
}
