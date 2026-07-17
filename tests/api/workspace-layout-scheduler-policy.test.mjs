import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  WORKSPACE_LAYOUT_MAX_SCHEDULE_ATTEMPTS,
  WORKSPACE_LAYOUT_RETRY_DELAYS_MINUTES,
  workspaceLayoutRetryDelayMinutes,
  workspaceLayoutScheduleIsExhausted,
} from "../../src/lib/workspace-layout-scheduler-policy.ts";

test("scheduler retry policy is bounded and deterministic", () => {
  assert.deepEqual(WORKSPACE_LAYOUT_RETRY_DELAYS_MINUTES, [5, 15, 45]);
  assert.equal(WORKSPACE_LAYOUT_MAX_SCHEDULE_ATTEMPTS, 3);
  assert.equal(workspaceLayoutRetryDelayMinutes(1), 5);
  assert.equal(workspaceLayoutRetryDelayMinutes(2), 15);
  assert.equal(workspaceLayoutRetryDelayMinutes(3), 45);
  assert.equal(workspaceLayoutRetryDelayMinutes(99), 45);
});

test("scheduler exhausts only at the configured attempt boundary", () => {
  assert.equal(workspaceLayoutScheduleIsExhausted(2, 3), false);
  assert.equal(workspaceLayoutScheduleIsExhausted(3, 3), true);
  assert.equal(workspaceLayoutScheduleIsExhausted(4, 3), true);
  assert.equal(workspaceLayoutScheduleIsExhausted(0, 0), false);
});
test("claimed schedules cannot be cancelled and cancelled requests cannot publish", () => {
  const scheduler = readFileSync("src/lib/ui-layout-scheduler.ts", "utf8");
  const publisher = readFileSync("scripts/publish-ui-layout.ts", "utf8");
  assert.match(scheduler, /inArray\(uiLayoutPublications\.status, \["scheduled", "retrying"\]\),\s+isNull\(uiLayoutPublications\.claimedAt\)/);
  assert.match(publisher, /status === "cancelled"/);
});
