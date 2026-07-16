import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isPrivateAdminPath,
  parseLayoutAdminAllowlist,
  selectAuthorizedLayoutAdminEmail,
} from "../../src/lib/ui-layout-admin-policy.ts";

test("Clerk middleware is scoped to private admin routes", () => {
  assert.equal(isPrivateAdminPath("/"), false);
  assert.equal(isPrivateAdminPath("/api/states"), false);
  assert.equal(isPrivateAdminPath("/administrator"), false);
  assert.equal(isPrivateAdminPath("/admin"), true);
  assert.equal(isPrivateAdminPath("/admin/layout"), true);
  assert.equal(isPrivateAdminPath("/admin/sign-in"), true);
});

test("layout admin allowlist is normalized and fails closed", () => {
  assert.deepEqual([...parseLayoutAdminAllowlist(undefined)], []);
  assert.deepEqual(
    [...parseLayoutAdminAllowlist(" Admin@Example.com, reviewer@example.com, ")],
    ["admin@example.com", "reviewer@example.com"],
  );
});

test("only a verified email supplied by auth can match the allowlist", () => {
  assert.equal(
    selectAuthorizedLayoutAdminEmail(
      ["Verified@Example.com"],
      "verified@example.com,other@example.com",
    ),
    "verified@example.com",
  );
  assert.equal(selectAuthorizedLayoutAdminEmail([], "verified@example.com"), undefined);
  assert.equal(selectAuthorizedLayoutAdminEmail(["stranger@example.com"], "verified@example.com"), undefined);
});

test("server authorization filters Clerk emails by verified status", () => {
  const auth = readFileSync("src/lib/ui-layout-auth.ts", "utf8");
  const actions = readFileSync("src/app/admin/layout/actions.ts", "utf8");
  const exitRoute = readFileSync("src/app/admin/layout/preview/exit/route.ts", "utf8");

  assert.match(auth, /verification\?\.status === "verified"/);
  assert.match(auth, /selectAuthorizedLayoutAdminEmail/);
  assert.equal(actions.match(/await requireLayoutAdmin\(\)/g)?.length, 4);
  assert.match(exitRoute, /await requireLayoutAdmin\(\)/);
});
