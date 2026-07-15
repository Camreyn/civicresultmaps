export const LAYOUT_VISITOR_COOKIE = "crm_layout_visitor";
export const LAYOUT_VISITOR_HEADER = "x-crm-layout-visitor";

export function isLayoutVisitorId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function selectLayoutVisitorId(...values: Array<string | null | undefined>) {
  return values.find((value): value is string => Boolean(value && isLayoutVisitorId(value)));
}
