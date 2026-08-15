import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeReleasePackage(root, relativePath) {
  if (
    typeof relativePath !== "string"
    || !/^\.etl\/precinct-release-candidates\/SC\/[^/]+\/release-candidate\.json$/.test(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
  ) {
    throw new Error("South Carolina Blob publication package path is unsafe");
  }
  const resolvedRoot = path.resolve(root);
  const absolutePath = path.resolve(root, ...relativePath.split("/"));
  if (!absolutePath.startsWith(resolvedRoot + path.sep)) {
    throw new Error("South Carolina Blob publication package escapes the repository");
  }
  return absolutePath;
}

function safePackageAsset(releaseRoot, relativePath) {
  if (
    typeof relativePath !== "string"
    || !relativePath.startsWith("delivery-assets/")
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
    || path.isAbsolute(relativePath)
  ) {
    throw new Error("South Carolina Blob publication asset path is unsafe");
  }
  const absolutePath = path.resolve(releaseRoot, ...relativePath.split("/"));
  if (!absolutePath.startsWith(path.resolve(releaseRoot) + path.sep)) {
    throw new Error("South Carolina Blob publication asset escapes the package");
  }
  return absolutePath;
}

function publicPathname(publicUrl) {
  if (
    typeof publicUrl !== "string"
    || !publicUrl.startsWith("/data/geography/sc/")
    || publicUrl.includes("\\")
    || publicUrl.includes("?")
    || publicUrl.includes("#")
  ) {
    throw new Error("South Carolina Blob publication URL is not a safe geography path");
  }
  const segments = publicUrl.split("/").filter(Boolean);
  if (segments.some((segment) => {
    try {
      const decoded = decodeURIComponent(segment);
      return decoded === "."
        || decoded === ".."
        || decoded.includes("/")
        || decoded.includes("\\");
    } catch {
      return true;
    }
  })) {
    throw new Error("South Carolina Blob publication URL has an unsafe segment");
  }
  return publicUrl.slice(1);
}

function inspectAsset(releaseRoot, declaration, kind, year) {
  const absolutePath = safePackageAsset(
    releaseRoot,
    declaration.packageRelativePath,
  );
  if (!existsSync(absolutePath)) {
    throw new Error(
      "South Carolina " + year + " " + kind + " asset is missing",
    );
  }
  const bytes = readFileSync(absolutePath);
  const digest = sha256(bytes);
  if (
    bytes.length !== declaration.byteCount
    || digest !== declaration.sha256
  ) {
    throw new Error(
      "South Carolina " + year + " " + kind + " asset hash or byte count drifted",
    );
  }
  return {
    kind,
    year,
    packageRelativePath: declaration.packageRelativePath,
    publicUrl: declaration.publicUrl,
    pathname: publicPathname(declaration.publicUrl),
    byteCount: bytes.length,
    sha256: digest,
    absolutePath,
  };
}

export function inspectSouthCarolinaPrecinctBlobPublicationPlan(options) {
  const root = path.resolve(options.root ?? process.cwd());
  if (!/^[a-f0-9]{64}$/.test(options.packageSha256 ?? "")) {
    throw new Error("South Carolina Blob publication requires the exact package SHA-256");
  }
  const packageAbsolutePath = safeReleasePackage(root, options.packagePath);
  if (!existsSync(packageAbsolutePath)) {
    throw new Error("South Carolina Blob publication package is missing");
  }
  const packageBytes = readFileSync(packageAbsolutePath);
  if (sha256(packageBytes) !== options.packageSha256) {
    throw new Error("South Carolina Blob publication package SHA-256 does not match");
  }
  const document = JSON.parse(packageBytes.toString("utf8"));
  if (
    document?.schemaVersion !== 1
    || document?.id !== "sc-precinct-gis-three-election-v1"
    || document?.state !== "SC"
    || document?.decision !== "NO_GO_PRODUCTION"
    || document?.safety?.publicFileWritten !== false
    || document?.safety?.canonicalManifestChanged !== false
    || document?.safety?.publicEligibilityChanged !== false
    || document?.totals?.elections !== 3
    || !Array.isArray(document.years)
    || document.years.length !== 3
  ) {
    throw new Error("South Carolina Blob publication package contract is incompatible");
  }
  const releaseRoot = path.dirname(packageAbsolutePath);
  const artifacts = [];
  for (const year of document.years) {
    const delivery = year.parentScopedDelivery;
    if (
      ![2016, 2020, 2024].includes(year.year)
      || delivery?.format !== "parent_scoped_geojson"
      || delivery?.publicationPerformed !== false
      || delivery?.electionValuesInDelivery !== false
      || delivery?.parentCount !== 46
      || delivery?.featureCount !== year.reviewedGeometry?.featureCount
      || !Array.isArray(delivery?.parentArtifacts)
      || delivery.parentArtifacts.length !== 46
      || year.proposedPublicDelivery?.format !== "parent_scoped_geojson"
      || year.proposedPublicDelivery?.sha256 !== delivery.index?.sha256
      || year.proposedPublicDelivery?.byteCount !== delivery.index?.byteCount
      || year.proposedPublicDelivery?.url !== delivery.index?.publicUrl
    ) {
      throw new Error(
        "South Carolina " + year.year + " parent-scoped publication contract drifted",
      );
    }
    for (const parent of delivery.parentArtifacts) {
      if (!/^45\d{3}$/.test(parent.parentGeoid ?? "")) {
        throw new Error(
          "South Carolina " + year.year + " publication has an invalid parent GEOID",
        );
      }
      artifacts.push(inspectAsset(releaseRoot, parent, "parent", year.year));
    }
    artifacts.push(inspectAsset(
      releaseRoot,
      delivery.index,
      "index",
      year.year,
    ));
  }
  const pathnames = new Set(artifacts.map((artifact) => artifact.pathname));
  if (artifacts.length !== 141 || pathnames.size !== artifacts.length) {
    throw new Error("South Carolina Blob publication asset set is incomplete or duplicated");
  }
  artifacts.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "parent" ? -1 : 1;
    return left.pathname.localeCompare(right.pathname);
  });
  return {
    schemaVersion: 1,
    state: "SC",
    releaseCandidate: {
      id: document.id,
      path: options.packagePath,
      sha256: options.packageSha256,
    },
    decision: "NO_GO_PUBLICATION",
    assetCount: artifacts.length,
    indexCount: artifacts.filter((artifact) => artifact.kind === "index").length,
    parentArtifactCount: artifacts.filter((artifact) => artifact.kind === "parent").length,
    totalByteCount: artifacts.reduce((sum, artifact) => sum + artifact.byteCount, 0),
    uploadOrder: "all parent artifacts before indexes",
    canonicalManifestChanged: false,
    publicEligibilityChanged: false,
    artifacts,
  };
}

export function validateSouthCarolinaBlobPublicationAuthorization(
  plan,
  environment = process.env,
) {
  if (
    environment.CRM_SC_PRECINCT_GEOGRAPHY_PUBLIC_FILE_WRITES
      !== "I_ACKNOWLEDGE_PUBLIC_IMMUTABLE_GEOMETRY_UPLOAD"
    || environment.CRM_SC_PRECINCT_GEOGRAPHY_PUBLIC_FILE_PACKAGE_SHA256
      !== plan.releaseCandidate.sha256
    || typeof environment.CRM_SC_PRECINCT_GEOGRAPHY_PUBLIC_FILE_AUTHORIZATION_ID
      !== "string"
    || !environment.CRM_SC_PRECINCT_GEOGRAPHY_PUBLIC_FILE_AUTHORIZATION_ID.trim()
  ) {
    throw new Error(
      "South Carolina public immutable geometry upload is not explicitly authorized",
    );
  }
  return {
    authorizationId:
      environment.CRM_SC_PRECINCT_GEOGRAPHY_PUBLIC_FILE_AUTHORIZATION_ID.trim(),
  };
}
