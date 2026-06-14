import { promoteNativeStagingArtifact } from "../src/db/native-import.ts";

const artifactPath = process.argv[2];

if (!artifactPath) {
  console.error("Usage: npm run native:promote -- .etl/staging/oh-2024-staging.json");
  process.exit(1);
}

try {
  const result = await promoteNativeStagingArtifact(artifactPath);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
