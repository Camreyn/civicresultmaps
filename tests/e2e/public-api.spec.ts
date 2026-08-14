import { expect, test } from "@playwright/test";
import { verifyPublicApiDeployment } from "../../scripts/lib/public-api-deployment-smoke.mjs";

test("public API routes honor filters, envelopes, gates, and error contracts", async ({ baseURL }) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("Playwright did not provide a base URL");

  await verifyPublicApiDeployment({
    baseUrl: baseURL,
    expectedGitSha: "1".repeat(40),
    expectedSource: "seed-fallback",
  });
});

test("public API verification rejects a production fallback or stale deployment", async ({ baseURL }) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("Playwright did not provide a base URL");

  await expect(
    verifyPublicApiDeployment({ baseUrl: baseURL, expectedSource: "database" }),
  ).rejects.toThrow(/data source/);
  await expect(
    verifyPublicApiDeployment({
      baseUrl: baseURL,
      expectedGitSha: "a".repeat(40),
      expectedSource: "seed-fallback",
    }),
  ).rejects.toThrow(/deployment that triggered this smoke test/);
});
