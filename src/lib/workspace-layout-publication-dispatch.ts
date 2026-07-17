import "server-only";

import type { LayoutPublicationEnvironment } from "./ui-layout-repository";

export type LayoutPublisherDispatchResult =
  | { kind: "dispatched"; message: string }
  | { kind: "queued"; message: string };

export async function dispatchLayoutPublisher(
  publicationId: string,
  environment: LayoutPublicationEnvironment,
): Promise<LayoutPublisherDispatchResult> {
  if (process.env.UI_LAYOUT_PUBLISH_WORKFLOW_ENABLED !== "true") {
    return {
      kind: "queued",
      message: "Publication recorded and safely queued. Dispatch remains disabled until the workflow is active on main.",
    };
  }
  const token = process.env.UI_LAYOUT_GITHUB_TOKEN;
  const repository = process.env.UI_LAYOUT_GITHUB_REPOSITORY ?? process.env.GITHUB_REPOSITORY;
  if (!token || !repository) {
    return {
      kind: "queued",
      message: "Publication recorded, but GitHub workflow dispatch is not configured yet.",
    };
  }
  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/ui-layout-publish.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: process.env.UI_LAYOUT_PUBLISH_REF ?? "main",
        inputs: { publication_id: publicationId, environment },
      }),
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    throw new Error(`GitHub workflow dispatch failed (${response.status}): ${detail}`);
  }
  return { kind: "dispatched", message: "Publication recorded and dispatched to the protected workflow." };
}
