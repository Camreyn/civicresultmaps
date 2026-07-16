export type LayoutActionState = {
  kind: "idle" | "success" | "error" | "conflict";
  message: string;
  revisionId?: string;
};

export const initialLayoutActionState: LayoutActionState = { kind: "idle", message: "" };
