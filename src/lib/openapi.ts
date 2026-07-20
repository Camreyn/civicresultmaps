import { currentNationalReleaseId, equipmentCatalogApiSchemaVersion, publicApiSchemaVersion } from "./api-version";

const envelopeMeta = {
  type: "object",
  required: ["generatedAt", "source", "releaseId", "schemaVersion"],
  properties: {
    generatedAt: { type: "string", format: "date-time" },
    source: { type: "string" },
    schemaVersion: { type: "string", example: publicApiSchemaVersion },
    releaseId: { type: ["string", "null"], example: currentNationalReleaseId },
    limit: { type: "integer", minimum: 1 },
    offset: { type: "integer", minimum: 0 },
    total: { type: "integer", minimum: 0 },
  },
  additionalProperties: true,
};

const errorResponse = {
  description: "The request could not be parsed or validated.",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
    },
  },
};

export function buildOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Civic Result Maps Public API",
      version: publicApiSchemaVersion,
      description: "Versioned, source-aware access to canonical U.S. county election results and comparison data. Advisory context identifies review questions and data gaps; it is not evidence of fraud or misconduct.",
      license: { name: "Public data; consult each source artifact for its terms" },
    },
    servers: [
      { url: "https://www.civicresultmaps.org", description: "Production" },
      { url: "http://localhost:3000", description: "Local development" },
    ],
    tags: [
      { name: "Comparisons", description: "Canonical county election comparisons" },
      { name: "Counties", description: "County registry, search, and profiles" },
      { name: "Releases", description: "Immutable release metadata and bulk downloads" },
      { name: "Equipment", description: "Source-linked certified configurations, change records, and evidence gaps" },
      { name: "Platform", description: "Existing state, source, and coverage endpoints" },
    ],
    paths: {
      "/api/v1/flips": {
        get: {
          tags: ["Comparisons"],
          operationId: "listCountyComparisons",
          summary: "List county flips and non-flips for a presidential year pair",
          parameters: [
            { name: "from", in: "query", schema: { type: "integer", enum: [2016, 2020, 2024], default: 2020 } },
            { name: "to", in: "query", schema: { type: "integer", enum: [2016, 2020, 2024], default: 2024 } },
            { name: "direction", in: "query", schema: { type: "string", enum: ["all", "red_to_blue", "blue_to_red", "no_flip"], default: "all" } },
            { name: "state", in: "query", schema: { type: "string", pattern: "^[A-Z]{2}$" } },
            { name: "fips", in: "query", schema: { type: "string", pattern: "^[0-9]{5}$" } },
            { name: "q", in: "query", schema: { type: "string", maxLength: 100 } },
            { name: "limit", in: "query", description: "Full JSON is capped at 1,000 rows; compact JSON and CSV support up to 5,000.", schema: { type: "integer", minimum: 1, maximum: 5000, default: 250 } },
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
            { name: "format", in: "query", schema: { type: "string", enum: ["json", "csv"], default: "json" } },
            { name: "view", in: "query", description: "Compact omits optional per-snapshot provenance fields while retaining row-level confidence and caveats.", schema: { type: "string", enum: ["full", "compact"], default: "full" } },
          ],
          responses: {
            "200": {
              description: "A paginated comparison envelope or CSV export.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/ComparisonEnvelope" } },
                "text/csv": { schema: { type: "string" } },
              },
            },
            "400": errorResponse,
          },
        },
      },
      "/api/v1/counties/{fips}": {
        get: {
          tags: ["Counties"],
          operationId: "getCountyProfile",
          summary: "Get a permanent county profile by five-digit FIPS",
          parameters: [{ name: "fips", in: "path", required: true, schema: { type: "string", pattern: "^[0-9]{5}$" } }],
          responses: {
            "200": {
              description: "County profile with presidential history and available contextual data.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/CountyProfileEnvelope" } } },
            },
            "400": { ...errorResponse, description: "FIPS must be exactly five digits." },
            "404": { ...errorResponse, description: "FIPS is not in the canonical registry." },
          },
        },
      },
      "/api/v1/jurisdictions": {
        get: {
          tags: ["Counties"],
          operationId: "listCanonicalCounties",
          summary: "List the canonical county and county-equivalent registry",
          parameters: [
            { name: "state", in: "query", schema: { type: "string", pattern: "^[A-Z]{2}$" } },
            { name: "fips", in: "query", schema: { type: "string", pattern: "^[0-9]{5}$" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 5000, default: 250 } },
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
          ],
          responses: {
            "200": {
              description: "Paginated canonical county registry.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/JurisdictionEnvelope" } } },
            },
            "400": errorResponse,
          },
        },
      },
      "/api/v1/jurisdictions/search": {
        get: {
          tags: ["Counties"],
          operationId: "searchCounties",
          summary: "Search canonical counties by FIPS, name, or alias",
          parameters: [
            { name: "q", in: "query", description: "Optional when state is provided.", schema: { type: "string", maxLength: 120 } },
            { name: "state", in: "query", schema: { type: "string", pattern: "^[A-Z]{2}$" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 10 } },
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
          ],
          responses: {
            "200": {
              description: "Paginated canonical county search results.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/CountySearchEnvelope" } } },
            },
            "400": errorResponse,
          },
        },
      },
      "/api/v1/confidence": {
        get: {
          tags: ["Platform"],
          operationId: "listConfidenceDefinitions",
          summary: "List the stable data-confidence vocabulary",
          responses: {
            "200": {
              description: "Confidence definitions used throughout the platform.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ConfidenceDefinitionEnvelope" } } },
            },
          },
        },
      },
      "/api/v1/releases": {
        get: {
          tags: ["Releases"],
          operationId: "listReleases",
          summary: "List national data releases",
          responses: {
            "200": {
              description: "Release catalog.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ReleaseCatalogEnvelope" } } },
            },
          },
        },
      },
      "/api/v1/releases/{releaseId}": {
        get: {
          tags: ["Releases"],
          operationId: "getRelease",
          summary: "Get one immutable release manifest",
          parameters: [{ name: "releaseId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Release manifest.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ReleaseEnvelope" } } },
            },
            "404": { ...errorResponse, description: "Unknown release." },
          },
        },
      },
      "/api/v1/releases/{releaseId}/download": {
        get: {
          tags: ["Releases"],
          operationId: "downloadRelease",
          summary: "Download the complete national release ZIP",
          parameters: [{ name: "releaseId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "307": {
              description: "Redirect to the immutable, content-addressed release ZIP.",
              headers: {
                Location: { schema: { type: "string" } },
                "X-Archive-Sha256": { schema: { type: "string", pattern: "^[a-f0-9]{64}$" } },
                "X-Data-Sha256": { schema: { type: "string", pattern: "^[a-f0-9]{64}$" } },
                "X-Release-Id": { schema: { type: "string" } },
              },
            },
            "404": { ...errorResponse, description: "Unknown release." },
          },
        },
      },
      "/api/v1/equipment-systems": {
        get: {
          tags: ["Equipment"],
          operationId: "listEquipmentSystems",
          summary: "List reviewed election-equipment system dossiers",
          description: "Feature-gated pilot. Certified configurations and jurisdiction deployment observations remain separate evidence scopes.",
          responses: {
            "200": {
              description: "Reviewed equipment-system summaries.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/EquipmentSystemListEnvelope" } } },
            },
            "404": { ...errorResponse, description: "The equipment catalog pilot is not enabled." },
          },
        },
      },
      "/api/v1/equipment-systems/{slug}": {
        get: {
          tags: ["Equipment"],
          operationId: "getEquipmentSystem",
          summary: "Get one source-linked equipment dossier",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Equipment system, component/version/change/finding/power/deployment records, and source manifest.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/EquipmentSystemDetailEnvelope" } } },
            },
            "404": { ...errorResponse, description: "Pilot disabled or equipment system not found." },
          },
        },
      },
      "/api/v1/openapi": {
        get: {
          tags: ["Platform"],
          operationId: "getOpenApiDocument",
          summary: "Get this OpenAPI 3.1 document",
          responses: {
            "200": { description: "OpenAPI document.", content: { "application/json": { schema: { type: "object" } } } },
          },
        },
      },
      "/api/results": { get: { tags: ["Platform"], summary: "List current contest result rows for one state", responses: { "200": { description: "Result rows." } } } },
      "/api/historical-baselines": { get: { tags: ["Platform"], summary: "List historical baseline rows for one state", responses: { "200": { description: "Historical rows." } } } },
      "/api/sources": { get: { tags: ["Platform"], summary: "List source records for one state", responses: { "200": { description: "Source records." } } } },
      "/api/completeness": { get: { tags: ["Platform"], summary: "List national state completeness summaries", responses: { "200": { description: "Completeness summaries." } } } },
    },
    components: {
      schemas: {
        EnvelopeMeta: envelopeMeta,
        ErrorEnvelope: {
          type: "object",
          required: ["data", "error", "meta"],
          properties: {
            data: { type: "null" },
            error: {
              oneOf: [
                { type: "string" },
                {
                  type: "object",
                  required: ["code", "message"],
                  properties: {
                    code: { type: "string" },
                    message: { type: "string" },
                    issues: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["field", "message"],
                        properties: {
                          field: { type: "string" },
                          message: { type: "string" },
                        },
                      },
                    },
                  },
                  additionalProperties: false,
                },
              ],
            },
            meta: { $ref: "#/components/schemas/EnvelopeMeta" },
          },
          additionalProperties: false,
        },
        ConfidenceLevel: {
          type: "string",
          enum: ["exact", "derived", "partial", "proxy", "non_geographic", "unavailable"],
        },
        DataConfidence: {
          type: "object",
          required: ["level", "label", "shortLabel", "description", "caveat"],
          properties: {
            level: { $ref: "#/components/schemas/ConfidenceLevel" },
            label: { type: "string" },
            shortLabel: { type: "string" },
            description: { type: "string" },
            caveat: { type: ["string", "null"] },
          },
          additionalProperties: false,
        },
        TurnoutSnapshot: {
          type: ["object", "null"],
          properties: {
            ballotsCast: { type: ["integer", "null"] },
            registeredVoters: { type: ["integer", "null"] },
            turnoutPct: { type: ["number", "null"] },
            denominatorNote: { type: ["string", "null"] },
          },
          additionalProperties: true,
        },
        ElectionSnapshot: {
          type: "object",
          required: [
            "year", "demCandidate", "repCandidate", "demVotes", "repVotes", "otherVotes",
            "totalVotes", "winner", "demMarginVotes", "demMarginPct", "confidence", "sourceId",
          ],
          properties: {
            year: { type: "integer", enum: [2016, 2020, 2024] },
            demCandidate: { type: "string" },
            repCandidate: { type: "string" },
            demVotes: { type: ["integer", "null"] },
            repVotes: { type: ["integer", "null"] },
            otherVotes: { type: ["integer", "null"] },
            totalVotes: { type: ["integer", "null"] },
            winner: { type: "string", enum: ["blue", "red", "tie", "unavailable"] },
            demMarginVotes: { type: ["integer", "null"] },
            demMarginPct: { type: ["number", "null"] },
            demSharePct: { type: ["number", "null"] },
            repSharePct: { type: ["number", "null"] },
            confidence: { $ref: "#/components/schemas/ConfidenceLevel" },
            caveat: { type: ["string", "null"] },
            sourceId: { type: "string" },
            sourceAuthority: { type: ["string", "null"] },
            sourceConfidence: { type: ["string", "null"] },
            sourceUrl: { type: ["string", "null"], format: "uri" },
            turnout: { $ref: "#/components/schemas/TurnoutSnapshot" },
          },
          additionalProperties: false,
        },
        CountyComparisonRow: {
          type: "object",
          required: [
            "state", "fips", "jurisdictionTag", "county", "direction", "from", "to",
            "marginSwingPct", "totalVoteChange", "totalVoteChangePct", "confidence", "caveat",
          ],
          properties: {
            state: { type: "string", pattern: "^[A-Z]{2}$" },
            fips: { type: "string", pattern: "^[0-9]{5}$" },
            jurisdictionTag: { type: "string", pattern: "^county:[0-9]{5}$" },
            county: { type: "string" },
            aliases: { type: "array", items: { type: "string" } },
            direction: { type: "string", enum: ["red_to_blue", "blue_to_red", "no_flip"] },
            from: { $ref: "#/components/schemas/ElectionSnapshot" },
            to: { $ref: "#/components/schemas/ElectionSnapshot" },
            marginSwingPct: { type: ["number", "null"] },
            totalVoteChange: { type: ["integer", "null"] },
            totalVoteChangePct: { type: ["number", "null"] },
            turnoutBallotsChange: { type: ["integer", "null"] },
            turnoutBallotsChangePct: { type: ["number", "null"] },
            confidence: { $ref: "#/components/schemas/ConfidenceLevel" },
            caveat: { type: ["string", "null"] },
          },
          additionalProperties: false,
        },
        ComparisonEnvelope: {
          type: "object",
          required: ["data", "meta"],
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/CountyComparisonRow" } },
            meta: {
              allOf: [
                { $ref: "#/components/schemas/EnvelopeMeta" },
                {
                  type: "object",
                  required: ["coverage", "filters", "pagination", "summary"],
                  properties: {
                    coverage: { type: "object", additionalProperties: true },
                    filters: { type: "object", additionalProperties: true },
                    pagination: {
                      type: "object",
                      required: ["hasMore", "limit", "offset", "returned", "total"],
                      properties: {
                        hasMore: { type: "boolean" },
                        limit: { type: "integer" },
                        offset: { type: "integer" },
                        returned: { type: "integer" },
                        total: { type: "integer" },
                      },
                    },
                    summary: { type: "object", additionalProperties: { type: "integer" } },
                  },
                },
              ],
            },
          },
        },
        CanonicalJurisdiction: {
          type: "object",
          required: ["state", "fips", "jurisdictionTag", "displayName", "aliases", "level", "geoid"],
          properties: {
            state: { type: "string", pattern: "^[A-Z]{2}$" },
            fips: { type: "string", pattern: "^[0-9]{5}$" },
            geoid: { type: "string", pattern: "^[0-9]{5}$" },
            jurisdictionTag: { type: "string", pattern: "^county:[0-9]{5}$" },
            displayName: { type: "string" },
            aliases: { type: "array", items: { type: "string" } },
            level: { type: "string" },
            geometryKey: { type: "string" },
            source: { type: "string" },
            caveat: { type: "string" },
          },
          additionalProperties: false,
        },
        JurisdictionEnvelope: {
          type: "object",
          required: ["data", "meta"],
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/CanonicalJurisdiction" } },
            meta: {
              allOf: [
                { $ref: "#/components/schemas/EnvelopeMeta" },
                {
                  type: "object",
                  required: ["hasMore", "limit", "offset", "total"],
                  properties: {
                    hasMore: { type: "boolean" },
                    limit: { type: "integer" },
                    offset: { type: "integer" },
                    total: { type: "integer" },
                  },
                },
              ],
            },
          },
        },
        ConfidenceDefinition: {
          type: "object",
          required: ["level", "label", "shortLabel", "description"],
          properties: {
            level: { $ref: "#/components/schemas/ConfidenceLevel" },
            label: { type: "string" },
            shortLabel: { type: "string" },
            description: { type: "string" },
          },
          additionalProperties: false,
        },
        ConfidenceDefinitionEnvelope: {
          type: "object",
          required: ["data", "meta"],
          properties: {
            data: {
              type: "array",
              minItems: 6,
              maxItems: 6,
              items: { $ref: "#/components/schemas/ConfidenceDefinition" },
            },
            meta: { $ref: "#/components/schemas/EnvelopeMeta" },
          },
        },
        CountyHistoricalContext: {
          type: "object",
          required: ["caveat", "effectiveDate", "formerFips", "formerName", "relationship", "sourceUrl", "successorFips"],
          properties: {
            caveat: { type: "string" },
            effectiveDate: { type: "string", format: "date" },
            formerFips: { type: "string", pattern: "^[0-9]{5}$" },
            formerName: { type: "string" },
            relationship: { type: "string" },
            sourceUrl: { type: "string", format: "uri" },
            successorFips: {
              type: "array",
              minItems: 1,
              items: { type: "string", pattern: "^[0-9]{5}$" },
            },
          },
          additionalProperties: false,
        },
        CountySearchMatch: {
          type: "object",
          required: ["state", "stateName", "fips", "jurisdictionTag", "displayName", "aliases", "matchedOn", "matchedValue", "score"],
          properties: {
            state: { type: "string", pattern: "^[A-Z]{2}$" },
            stateName: { type: "string" },
            fips: { type: "string", pattern: "^[0-9]{5}$" },
            jurisdictionTag: { type: "string", pattern: "^county:[0-9]{5}$" },
            displayName: { type: "string" },
            aliases: { type: "array", items: { type: "string" } },
            historicalContext: { $ref: "#/components/schemas/CountyHistoricalContext" },
            matchedOn: { type: "string", enum: ["alias", "fips", "historical_fips", "historical_name", "name", "state"] },
            matchedValue: { type: "string" },
            score: { type: "integer" },
            caveat: { type: "string" },
          },
          additionalProperties: true,
        },
        CountySearchEnvelope: {
          type: "object",
          required: ["data", "meta"],
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/CountySearchMatch" } },
            meta: {
              allOf: [
                { $ref: "#/components/schemas/EnvelopeMeta" },
                {
                  type: "object",
                  required: ["limit", "offset", "total"],
                  properties: {
                    hasMore: { type: "boolean" },
                    limit: { type: "integer" },
                    offset: { type: "integer" },
                    total: { type: "integer" },
                  },
                },
              ],
            },
          },
        },
        CountyElectionHistory: {
          type: "object",
          required: ["year", "available", "demVotes", "repVotes", "otherVotes", "totalVotes", "leader", "marginVotes", "marginPct", "confidence"],
          properties: {
            year: { type: "integer", enum: [2016, 2020, 2024] },
            available: { type: "boolean" },
            demVotes: { type: ["integer", "null"] },
            repVotes: { type: ["integer", "null"] },
            otherVotes: { type: ["integer", "null"] },
            totalVotes: { type: ["integer", "null"] },
            leader: { type: ["string", "null"], enum: ["Democratic", "Republican", "Tie", null] },
            marginVotes: { type: ["integer", "null"] },
            marginPct: { type: ["number", "null"] },
            confidence: { $ref: "#/components/schemas/DataConfidence" },
            caveats: { type: "array", items: { type: "string" } },
          },
          additionalProperties: true,
        },
        CountyProfile: {
          type: "object",
          required: [
            "state", "stateName", "fips", "jurisdictionTag", "displayName", "aliases",
            "history", "turnout", "equipment", "voteMethods", "advisoryIndicators",
            "sources", "confidence", "caveats",
          ],
          properties: {
            state: { type: "string", pattern: "^[A-Z]{2}$" },
            stateName: { type: "string" },
            fips: { type: "string", pattern: "^[0-9]{5}$" },
            jurisdictionTag: { type: "string", pattern: "^county:[0-9]{5}$" },
            displayName: { type: "string" },
            aliases: { type: "array", items: { type: "string" } },
            history: { type: "array", minItems: 3, maxItems: 3, items: { $ref: "#/components/schemas/CountyElectionHistory" } },
            turnout: { type: "object", additionalProperties: true },
            equipment: { type: "array", items: { type: "object", additionalProperties: true } },
            voteMethods: { type: "array", items: { type: "object", additionalProperties: true } },
            advisoryIndicators: { type: "array", items: { type: "object", additionalProperties: true } },
            sources: { type: "array", items: { type: "object", additionalProperties: true } },
            confidence: { $ref: "#/components/schemas/DataConfidence" },
            caveats: { type: "array", items: { type: "string" } },
          },
          additionalProperties: true,
        },
        CountyProfileEnvelope: {
          type: "object",
          required: ["data", "meta"],
          properties: {
            data: { $ref: "#/components/schemas/CountyProfile" },
            meta: { $ref: "#/components/schemas/EnvelopeMeta" },
          },
        },
        EquipmentSystemSummary: {
          type: "object",
          required: ["slug", "displayName", "manufacturer", "systemName", "systemVersion", "deviceName", "deviceRole", "status", "summary", "certification", "claimRevision", "editorialState", "coverage"],
          properties: {
            slug: { type: "string" },
            displayName: { type: "string" },
            manufacturer: { type: "string" },
            systemName: { type: "string" },
            systemVersion: { type: "string" },
            deviceName: { type: "string" },
            deviceRole: { type: "string" },
            status: { type: "string", enum: ["pilot"] },
            summary: { type: "string" },
            certification: { type: "object", additionalProperties: true },
            claimRevision: { type: "integer", minimum: 1 },
            editorialState: { type: "string", enum: ["approved", "published"] },
            coverage: { type: "object", additionalProperties: { type: "integer" } },
          },
          additionalProperties: true,
        },
        EquipmentSourceRevision: {
          type: "object",
          required: ["id", "localArtifact", "sha256", "byteLength", "publishedOn", "retrievedOn", "retrievedAt", "retrievalPrecision", "resolvedUrl", "http", "supersedesRevisionId", "contentStatus", "pageOrSection", "archiveStatus"],
          properties: {
            id: { type: "string" },
            localArtifact: { type: "string" },
            sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
            byteLength: { type: "integer", minimum: 1 },
            publishedOn: { type: ["string", "null"], format: "date" },
            retrievedOn: { type: "string", format: "date" },
            retrievedAt: { type: ["string", "null"], format: "date-time" },
            retrievalPrecision: { type: "string", enum: ["date", "timestamp"] },
            resolvedUrl: { type: "string", format: "uri" },
            http: { type: "object", additionalProperties: { type: ["string", "null"] } },
            supersedesRevisionId: { type: ["string", "null"] },
            contentStatus: { type: "string", enum: ["baseline", "content_changed"] },
            pageOrSection: { type: "string" },
            archiveStatus: { type: "string", enum: ["verified", "pending_review", "rejected"] },
          },
          additionalProperties: false,
        },
        EquipmentSourceRevisionComparison: {
          type: "object",
          required: ["id", "fromRevisionId", "toRevisionId", "detectedAt", "kind", "machineSummary", "editorialImpact", "reviewState"],
          properties: {
            id: { type: "string" },
            fromRevisionId: { type: "string" },
            toRevisionId: { type: "string" },
            detectedAt: { type: "string", format: "date-time" },
            kind: { type: "string", enum: ["unchanged", "metadata_changed", "content_changed", "unavailable", "retrieval_error"] },
            machineSummary: { type: "string" },
            editorialImpact: { type: "string", enum: ["none", "requires_claim_review"] },
            reviewState: { type: "string", enum: ["pending", "approved", "rejected"] },
            reviewNote: { type: ["string", "null"] },
            reviewedAt: { type: ["string", "null"], format: "date-time" },
            reviewedBy: { type: ["string", "null"] },
          },
          additionalProperties: false,
        },
        EquipmentSource: {
          type: "object",
          required: ["id", "publisher", "authorityLevel", "title", "url", "canonicalUrl", "localArtifact", "sha256", "documentType", "retrievedOn", "pageOrSection", "caveat", "currentReviewedRevisionId", "latestRetrievedRevisionId", "revisions", "revisionComparisons"],
          properties: {
            id: { type: "string" },
            publisher: { type: "string" },
            authorityLevel: { type: "string" },
            title: { type: "string" },
            url: { type: "string", format: "uri" },
            canonicalUrl: { type: "string", format: "uri" },
            localArtifact: { type: "string" },
            sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
            documentType: { type: "string" },
            publishedOn: { type: ["string", "null"], format: "date" },
            retrievedOn: { type: "string", format: "date" },
            pageOrSection: { type: "string" },
            caveat: { type: "string" },
            currentReviewedRevisionId: { type: "string" },
            latestRetrievedRevisionId: { type: "string" },
            revisions: { type: "array", items: { $ref: "#/components/schemas/EquipmentSourceRevision" } },
            revisionComparisons: { type: "array", items: { $ref: "#/components/schemas/EquipmentSourceRevisionComparison" } },
          },
          additionalProperties: false,
        },
        EquipmentSystem: {
          allOf: [
            { $ref: "#/components/schemas/EquipmentSystemSummary" },
            {
              type: "object",
              required: ["components", "versionObservations", "configurationChanges", "findings", "power", "deployments", "scene", "caveats", "sourceIds", "sourceRevisionIds"],
              properties: {
                components: { type: "array", items: { type: "object", additionalProperties: true } },
                versionObservations: { type: "array", items: { type: "object", additionalProperties: true } },
                configurationChanges: { type: "array", items: { type: "object", additionalProperties: true } },
                findings: { type: "array", items: { type: "object", additionalProperties: true } },
                power: { type: "array", items: { type: "object", additionalProperties: true } },
                deployments: { type: "array", items: { type: "object", additionalProperties: true } },
                scene: { type: "object", additionalProperties: true },
                caveats: { type: "array", items: { type: "string" } },
                sourceIds: { type: "array", items: { type: "string" } },
                sourceRevisionIds: { type: "array", items: { type: "string" } },
              },
            },
          ],
        },
        EquipmentSystemListEnvelope: {
          type: "object",
          required: ["data", "meta"],
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/EquipmentSystemSummary" } },
            meta: { allOf: [{ $ref: "#/components/schemas/EnvelopeMeta" }, { type: "object", properties: { schemaVersion: { type: "string", example: equipmentCatalogApiSchemaVersion } } }] },
          },
        },
        EquipmentSystemDetailEnvelope: {
          type: "object",
          required: ["data", "meta"],
          properties: {
            data: {
              type: "object",
              required: ["system", "sources"],
              properties: {
                system: { $ref: "#/components/schemas/EquipmentSystem" },
                sources: { type: "array", items: { $ref: "#/components/schemas/EquipmentSource" } },
              },
            },
            meta: { allOf: [{ $ref: "#/components/schemas/EnvelopeMeta" }, { type: "object", properties: { schemaVersion: { type: "string", example: equipmentCatalogApiSchemaVersion } } }] },
          },
        },
        NationalDataRelease: {
          type: "object",
          required: ["id", "title", "publishedAt", "status", "electionYears", "geographyContract", "geographyVintage", "geographyVintageYear", "historicalGeographyPolicy", "dataSha256", "archivePath", "archiveSha256", "coverage", "changes", "knownLimitations"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            publishedAt: { type: "string", format: "date-time" },
            status: { type: "string", enum: ["current", "superseded"] },
            electionYears: { type: "array", items: { type: "integer", enum: [2016, 2020, 2024] } },
            geographyContract: { type: "string" },
            geographyVintage: { type: "string" },
            geographyVintageYear: { type: "integer" },
            historicalGeographyPolicy: { type: "string" },
            dataSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
            archivePath: { type: "string" },
            archiveSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
            coverage: { type: "object", additionalProperties: true },
            comparisonSummary: { type: "object", additionalProperties: true },
            changes: { type: "array", items: { type: "string" } },
            knownLimitations: { type: "array", items: { type: "string" } },
          },
          additionalProperties: true,
        },
        ReleaseEnvelope: {
          type: "object",
          required: ["data", "meta"],
          properties: {
            data: { $ref: "#/components/schemas/NationalDataRelease" },
            meta: { $ref: "#/components/schemas/EnvelopeMeta" },
          },
        },
        ReleaseCatalogEnvelope: {
          type: "object",
          required: ["data", "meta"],
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/NationalDataRelease" } },
            meta: { $ref: "#/components/schemas/EnvelopeMeta" },
          },
        },
      },
    },
    externalDocs: { description: "Civic Result Maps API guide", url: "https://www.civicresultmaps.org/developers" },
  } as const;
}
