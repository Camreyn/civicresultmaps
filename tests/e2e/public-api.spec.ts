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

test("local geography routes reject a cross-state county parent at the API boundary", async ({
  request,
}) => {
  const expectedError =
    "parentGeoid must be a five-digit county GEOID beginning with 12 for FL";
  const responses = await Promise.all([
    request.get(
      "/api/results?state=FL&year=2024&level=precinct"
      + "&office=president&parentGeoid=13001",
    ),
    request.get(
      "/api/precinct-geography"
      + "?manifestId=fl-2024-11-05-reviewed-precinct-geometry-v1"
      + "&parentGeoid=13001",
    ),
  ]);

  for (const response of responses) {
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      data: null,
      error: expectedError,
    });
  }
});
