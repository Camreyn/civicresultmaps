"use client";

import { LayoutEditor as LayoutEditorV3 } from "./layout-editor-v3";
import { LayoutEditorV4 } from "./layout-editor-v4";
import { workspaceLayoutManifestV3ToV2 } from "@/lib/workspace-layout-v3";
import type { LayoutEditorV4Props } from "./layout-editor-v4-types";

export function LayoutEditor(props: LayoutEditorV4Props) {
  if (props.builderV4Enabled) return <LayoutEditorV4 {...props} />;
  return (
    <LayoutEditorV3
      activeDraftRevisionId={props.activeDraftRevisionId}
      assets={props.assets}
      baseManifest={workspaceLayoutManifestV3ToV2(props.baseManifest)}
      parentRevisionId={props.parentRevisionId}
      publications={props.publications.map((publication) => ({
        action: publication.action,
        channel: publication.channel,
        completedAt: publication.completedAt,
        environment: publication.environment,
        failureMessage: publication.failureMessage,
        id: publication.id,
        requestedAt: publication.requestedAt,
        revisionId: publication.revisionId,
        status: publication.status,
      }))}
      publisherEnabled={props.publisherEnabled}
      requestKey={props.requestKey}
      revisions={props.revisions.map((revision) => ({ ...revision, manifest: workspaceLayoutManifestV3ToV2(revision.manifest) }))}
      templates={props.templates.map((template) => ({ ...template, manifest: workspaceLayoutManifestV3ToV2(template.manifest) }))}
    />
  );
}

export type {
  LayoutAssetSummary,
  LayoutDraftSummary,
  LayoutGroupTemplateSummary,
  LayoutPublicationSummary,
  LayoutRevisionSummary,
  LayoutTemplateSummary,
} from "./layout-editor-v4-types";
