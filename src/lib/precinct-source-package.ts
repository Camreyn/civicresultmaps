import { z } from "zod";

export const PRECINCT_SOURCE_PACKAGE_SCHEMA_VERSION = 1 as const;

const httpsUrl = z.string().url().refine(
  (value) => new URL(value).protocol === "https:",
  "must use HTTPS",
);

const repositoryDataPath = z.string().refine(
  (value) =>
    value.startsWith("data/")
    && !value.startsWith("/")
    && !value.includes("\\")
    && !value.split("/").includes(".."),
  "must be a safe repository-relative path under data/",
);

const sha256 = z.string().regex(
  /^[a-f0-9]{64}$/i,
  "must be a 64-character SHA-256 value",
);

const sourceIndexSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]+$/),
  kind: z.enum([
    "statewide",
    "county_precincts",
    "city_precincts",
    "locality_precincts",
    "supplemental",
  ]),
  url: httpsUrl,
  retrievedAt: z.string().datetime({ offset: true }),
  retrievalMethod: z.enum(["http", "browser_assisted", "manual"]),
  boundaryBasis: z.string().min(1),
  effectiveDate: z.string().date().nullable(),
  caveats: z.array(z.string()),
});

const archiveSchema = z.object({
  format: z.literal("shapefile_zip"),
  members: z.array(z.string().min(1)).min(4),
  selectedLayer: z.string().min(1).optional(),
  sourceCrs: z.string().min(1),
  sourceFeatureCount: z.number().int().positive(),
  nativeFieldNames: z.array(z.string().min(1)).min(1),
}).superRefine((value, context) => {
  for (const extension of [".shp", ".shx", ".dbf", ".prj"]) {
    const matching = value.selectedLayer
      ? value.members.filter(
          (member) =>
            member.toLowerCase()
            === (value.selectedLayer + extension).toLowerCase(),
        )
      : value.members.filter((member) =>
          member.toLowerCase().endsWith(extension)
        );
    if (matching.length !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: value.selectedLayer
          ? "members must contain selectedLayer " + extension + " file"
          : "members must contain exactly one "
            + extension
            + " file, or selectedLayer must identify one layer",
        path: ["members"],
      });
    }
  }
});

const sourceParentSchema = z.object({
  name: z.string().min(1),
  geoid: z.string().regex(/^\d{5}$/),
});

const sourcePackageSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]+$/),
  indexId: z.string().min(1),
  label: z.string().min(1),
  url: httpsUrl,
  artifact: repositoryDataPath,
  sha256,
  byteCount: z.number().int().positive(),
  parent: sourceParentSchema.nullable(),
  coveredParents: z.array(sourceParentSchema).min(1).optional(),
  parentAssignmentStatus: z.enum([
    "confirmed",
    "pending",
    "ambiguous",
  ]).optional(),
  packageRole: z.enum(["primary", "supplemental"]),
  archive: archiveSchema,
});

const missingParentSchema = z.object({
  name: z.string().min(1),
  geoid: z.string().regex(/^\d{5}$/),
  reason: z.string().min(1),
});

export const PrecinctSourcePackageManifestSchema = z.object({
  schemaVersion: z.literal(PRECINCT_SOURCE_PACKAGE_SCHEMA_VERSION),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]+$/),
  state: z.string().regex(/^[A-Z]{2}$/),
  election: z.object({
    id: z.string().min(1),
    date: z.string().date(),
    type: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  }),
  geographyLevel: z.string().min(1),
  authority: z.string().min(1),
  licenseOrTerms: z.string().min(1),
  indexes: z.array(sourceIndexSchema).min(1),
  packages: z.array(sourcePackageSchema).min(1),
  coverage: z.object({
    expectedParentCount: z.number().int().positive(),
    parentsWithPackages: z.number().int().nonnegative(),
    missingParents: z.array(missingParentSchema),
  }),
  summary: z.object({
    packageCount: z.number().int().positive(),
    byteCount: z.number().int().positive(),
    sourceFeatureCount: z.number().int().positive(),
  }),
  caveats: z.array(z.string()),
}).superRefine((value, context) => {
  if (value.election.id !== value.election.date + "-" + value.election.type) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "election.id must be the election date followed by election.type",
      path: ["election", "id"],
    });
  }

  const indexIds = new Set<string>();
  for (const [index, sourceIndex] of value.indexes.entries()) {
    if (indexIds.has(sourceIndex.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duplicate source index ID " + sourceIndex.id,
        path: ["indexes", index, "id"],
      });
    }
    indexIds.add(sourceIndex.id);
  }

  for (const [index, sourcePackage] of value.packages.entries()) {
    const hasAssignedParents = Boolean(
      sourcePackage.parent || sourcePackage.coveredParents?.length,
    );
    const assignmentStatus = sourcePackage.parentAssignmentStatus
      ?? (hasAssignedParents ? "confirmed" : null);
    if (!hasAssignedParents && assignmentStatus === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "parentAssignmentStatus is required when parent is not assigned",
        path: ["packages", index, "parentAssignmentStatus"],
      });
    }
    if (!hasAssignedParents && assignmentStatus === "confirmed") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "confirmed parent assignment requires parent metadata",
        path: ["packages", index, "parent"],
      });
    }
    if (sourcePackage.parent && sourcePackage.coveredParents) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "parent and coveredParents are mutually exclusive",
        path: ["packages", index, "coveredParents"],
      });
    }
    if (sourcePackage.coveredParents && assignmentStatus !== "confirmed") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "coveredParents requires a confirmed parent assignment",
        path: ["packages", index, "parentAssignmentStatus"],
      });
    }
  }

  const packageIds = new Set<string>();
  const packageUrls = new Set<string>();
  const artifactPaths = new Set<string>();
  const parentGeoids = new Set<string>();
  let byteCount = 0;
  let sourceFeatureCount = 0;

  for (const [index, sourcePackage] of value.packages.entries()) {
    if (!indexIds.has(sourcePackage.indexId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "references unknown source index " + sourcePackage.indexId,
        path: ["packages", index, "indexId"],
      });
    }
    for (
      const [set, item, field] of [
        [packageIds, sourcePackage.id, "id"],
        [packageUrls, sourcePackage.url, "url"],
        [artifactPaths, sourcePackage.artifact, "artifact"],
      ] as const
    ) {
      if (set.has(item)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "duplicate package " + field + " " + item,
          path: ["packages", index, field],
        });
      }
      set.add(item);
    }
    if (
      sourcePackage.parent
      && (sourcePackage.parentAssignmentStatus ?? "confirmed") === "confirmed"
    ) {
      parentGeoids.add(sourcePackage.parent.geoid);
    }
    if (
      sourcePackage.coveredParents
      && (sourcePackage.parentAssignmentStatus ?? "confirmed") === "confirmed"
    ) {
      const coveredGeoids = new Set<string>();
      for (
        const [parentIndex, parent] of sourcePackage.coveredParents.entries()
      ) {
        if (coveredGeoids.has(parent.geoid)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "duplicate covered parent " + parent.geoid,
            path: ["packages", index, "coveredParents", parentIndex, "geoid"],
          });
        }
        coveredGeoids.add(parent.geoid);
        parentGeoids.add(parent.geoid);
      }
    }
    byteCount += sourcePackage.byteCount;
    sourceFeatureCount += sourcePackage.archive.sourceFeatureCount;
  }

  const missingGeoids = new Set<string>();
  for (const [index, missingParent] of value.coverage.missingParents.entries()) {
    if (parentGeoids.has(missingParent.geoid)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "parent is both covered and missing: " + missingParent.geoid,
        path: ["coverage", "missingParents", index, "geoid"],
      });
    }
    if (missingGeoids.has(missingParent.geoid)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duplicate missing parent " + missingParent.geoid,
        path: ["coverage", "missingParents", index, "geoid"],
      });
    }
    missingGeoids.add(missingParent.geoid);
  }

  if (value.summary.packageCount !== value.packages.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "must equal packages.length",
      path: ["summary", "packageCount"],
    });
  }
  if (value.summary.byteCount !== byteCount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "must equal the sum of package byte counts",
      path: ["summary", "byteCount"],
    });
  }
  if (value.summary.sourceFeatureCount !== sourceFeatureCount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "must equal the sum of package feature counts",
      path: ["summary", "sourceFeatureCount"],
    });
  }
  if (value.coverage.parentsWithPackages !== parentGeoids.size) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "must equal the number of unique package parent GEOIDs",
      path: ["coverage", "parentsWithPackages"],
    });
  }
  if (
    value.coverage.expectedParentCount
    !== parentGeoids.size + missingGeoids.size
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "must equal covered parents plus explicitly missing parents",
      path: ["coverage", "expectedParentCount"],
    });
  }
});

export type PrecinctSourcePackageManifest = z.infer<
  typeof PrecinctSourcePackageManifestSchema
>;

export function inspectPrecinctSourcePackageManifest(value: unknown) {
  const result = PrecinctSourcePackageManifestSchema.safeParse(value);
  if (result.success) {
    return {
      errors: [] as string[],
      manifest: result.data,
    };
  }
  return {
    errors: result.error.issues.map((issue) => {
      const pathname = issue.path.length ? issue.path.join(".") : "manifest";
      return pathname + ": " + issue.message;
    }),
    manifest: null,
  };
}
