// This command intentionally does not load .env.local. Its resolver accepts
// only the explicitly supplied crm_clone_dev URL and local-write opt-in.
process.env.CRM_DATABASE_DRIVER = "postgres";

const artifactPath = process.argv[2];
if (!artifactPath) {
  console.error("Usage: npm run native:promote:local -- .etl/staging/oh-2024-staging.json");
  process.exit(1);
}

try {
  const { promoteNativeStagingArtifact } = await import("../src/db/native-import.ts");
  const result = await promoteNativeStagingArtifact(artifactPath);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
