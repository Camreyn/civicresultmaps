export function activeMapSelection<T>(
  pinned: T | null,
  preview: T | null,
  fallback: T | null = null,
): T | null {
  return pinned ?? preview ?? fallback;
}
