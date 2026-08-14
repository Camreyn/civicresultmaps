export type PublicApiSmokeOptions = {
  baseUrl: string;
  bypassSecret?: string;
  expectedGitSha?: string;
  expectedSource?: string;
};

export type PublicApiSmokeSummary = {
  baseUrl: string;
  checks: number;
  rowCounts: Record<string, number>;
};

export function verifyPublicApiDeployment(
  options: PublicApiSmokeOptions,
): Promise<PublicApiSmokeSummary>;
