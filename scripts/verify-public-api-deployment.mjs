import { verifyPublicApiDeployment } from "./lib/public-api-deployment-smoke.mjs";

const defaultAttempts = 12;
const defaultDelayMs = 5_000;

function readArgument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const baseUrl = readArgument("base-url") ?? process.env.PUBLIC_API_SMOKE_BASE_URL ?? "";
const expectedGitSha = readArgument("expect-git-sha") ?? process.env.PUBLIC_API_SMOKE_EXPECT_GIT_SHA ?? "";
const expectedSource = readArgument("expect-source") ?? process.env.PUBLIC_API_SMOKE_EXPECT_SOURCE ?? "";
const attempts = Number(readArgument("attempts") ?? defaultAttempts);
const delayMs = Number(readArgument("delay-ms") ?? defaultDelayMs);

if (!baseUrl) {
  throw new Error(
    "Provide --base-url=<url> or PUBLIC_API_SMOKE_BASE_URL for the public API smoke test.",
  );
}
if (!Number.isInteger(attempts) || attempts < 1 || !Number.isInteger(delayMs) || delayMs < 0) {
  throw new Error("Smoke retry options must be non-negative integers and attempts must be at least 1.");
}

let lastError;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const summary = await verifyPublicApiDeployment({
      baseUrl,
      bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      expectedGitSha,
      expectedSource,
    });
    console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt === attempts) break;
    console.warn(`Public API smoke attempt ${attempt}/${attempts} failed: ${error.message}`);
    await wait(delayMs);
  }
}

throw lastError;
