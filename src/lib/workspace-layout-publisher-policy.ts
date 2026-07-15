export const workspaceLayoutPublicationEnvironments = ["preview", "production"] as const;
export const workspaceLayoutPublicationActions = ["stage", "promote", "rollback"] as const;

export type WorkspaceLayoutPublicationEnvironment =
  (typeof workspaceLayoutPublicationEnvironments)[number];
export type WorkspaceLayoutPublicationAction =
  (typeof workspaceLayoutPublicationActions)[number];

export function isWorkspaceLayoutPublicationEnvironment(
  value: string,
): value is WorkspaceLayoutPublicationEnvironment {
  return workspaceLayoutPublicationEnvironments.some((environment) => environment === value);
}

export function isWorkspaceLayoutPublicationAction(
  value: string,
): value is WorkspaceLayoutPublicationAction {
  return workspaceLayoutPublicationActions.some((action) => action === value);
}

export function workspaceLayoutPublicationChannel(
  action: WorkspaceLayoutPublicationAction,
) {
  return action === "stage" ? "candidate" as const : "stable" as const;
}

export function workspaceLayoutEdgeKeys(action: WorkspaceLayoutPublicationAction) {
  return action === "stage"
    ? ["workspaceLayoutCandidate"] as const
    : ["workspaceLayoutStable", "workspaceLayoutCandidate"] as const;
}
