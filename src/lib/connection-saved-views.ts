import { z } from "zod";

const coordinate = z.number().finite().min(-1000000).max(1000000);
const entityId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);
const savedViewSchema = z.object({
  name: z.string().trim().min(1).max(80), url: z.string().max(8000), releaseId: z.string().max(200),
  pinned: z.array(entityId).max(2000),
  positions: z.record(z.object({ x: coordinate, y: coordinate }).strict()).refine((value) => Object.keys(value).length <= 2000),
}).strict();
export type SavedConnectionView = z.infer<typeof savedViewSchema>;
export function savedConnectionViews(raw: string | null): SavedConnectionView[] {
  if (!raw || raw.length > 1024 * 1024) return [];
  try {
    const input: unknown = JSON.parse(raw);
    if (!Array.isArray(input)) return [];
    const valid = input.slice(-20).flatMap((item) => { const result = savedViewSchema.safeParse(item); return result.success ? [result.data] : []; });
    return [...new Map(valid.map((view) => [view.name, view])).values()];
  } catch { return []; }
}
