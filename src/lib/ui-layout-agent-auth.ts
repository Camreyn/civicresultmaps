import { createHash, timingSafeEqual } from "node:crypto";

export const UI_LAYOUT_AGENT_MAX_BODY_BYTES = 256_000;
export const UI_LAYOUT_AGENT_TOKEN_MIN_LENGTH = 32;

type Environment = Record<string, string | undefined>;

export type LayoutAgentAuthorization =
  | { kind: "authorized" }
  | { kind: "disabled"; message: string; status: 404 }
  | { kind: "forbidden"; message: string; status: 403 }
  | { kind: "misconfigured"; message: string; status: 503 }
  | { kind: "unauthorized"; message: string; status: 401 };

export function authorizeLayoutAgentRequest(
  headers: Headers,
  environment: Environment = process.env,
): LayoutAgentAuthorization {
  if (environment.UI_LAYOUT_AGENT_ENABLED !== "true") {
    return { kind: "disabled", message: "Layout agent tooling is disabled.", status: 404 };
  }
  const configuredToken = environment.UI_LAYOUT_AGENT_TOKEN ?? "";
  if (configuredToken.length < UI_LAYOUT_AGENT_TOKEN_MIN_LENGTH) {
    return { kind: "misconfigured", message: "Layout agent authentication is not configured.", status: 503 };
  }
  if (!isAllowedLayoutAgentOrigin(headers.get("origin"), environment)) {
    return { kind: "forbidden", message: "Request origin is not allowed.", status: 403 };
  }
  const suppliedToken = parseBearerToken(headers.get("authorization"));
  if (!suppliedToken || !constantTimeTokenMatch(configuredToken, suppliedToken)) {
    return { kind: "unauthorized", message: "Valid bearer authentication is required.", status: 401 };
  }
  return { kind: "authorized" };
}

export function isAllowedLayoutAgentOrigin(origin: string | null, environment: Environment = process.env) {
  if (!origin) return true;
  let normalized: string;
  try {
    normalized = new URL(origin).origin;
  } catch {
    return false;
  }
  return allowedOrigins(environment).has(normalized);
}

export function parseBearerToken(value: string | null) {
  const match = value?.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1];
}

export function constantTimeTokenMatch(expected: string, supplied: string) {
  const expectedDigest = createHash("sha256").update(expected).digest();
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}

function allowedOrigins(environment: Environment) {
  const origins = new Set([
    "https://civicresultmaps.org",
    "https://www.civicresultmaps.org",
  ]);
  if (environment.NODE_ENV !== "production") {
    origins.add("http://127.0.0.1:3000");
    origins.add("http://localhost:3000");
  }
  if (environment.VERCEL_URL) origins.add(`https://${environment.VERCEL_URL}`);
  for (const value of (environment.UI_LAYOUT_AGENT_ALLOWED_ORIGINS ?? "").split(",")) {
    const candidate = value.trim();
    if (!candidate) continue;
    try {
      origins.add(new URL(candidate).origin);
    } catch {
      // Invalid configured origins are ignored so authorization fails closed.
    }
  }
  return origins;
}
