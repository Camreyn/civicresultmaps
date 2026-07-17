export const WORKSPACE_LAYOUT_RETRY_DELAYS_MINUTES = [5, 15, 45] as const;
export const WORKSPACE_LAYOUT_MAX_SCHEDULE_ATTEMPTS = 3;
export const WORKSPACE_LAYOUT_STALE_CLAIM_MINUTES = 15;

export function workspaceLayoutRetryDelayMinutes(attemptCount: number) {
  if (!Number.isFinite(attemptCount)) return WORKSPACE_LAYOUT_RETRY_DELAYS_MINUTES[0];
  const index = Math.max(0, Math.min(Math.trunc(attemptCount) - 1, WORKSPACE_LAYOUT_RETRY_DELAYS_MINUTES.length - 1));
  return WORKSPACE_LAYOUT_RETRY_DELAYS_MINUTES[index]!;
}

export function workspaceLayoutScheduleIsExhausted(attemptCount: number, maxAttempts: number) {
  return Number.isInteger(attemptCount)
    && Number.isInteger(maxAttempts)
    && maxAttempts > 0
    && attemptCount >= maxAttempts;
}
