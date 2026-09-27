import { mkdtemp, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { DeliveryVerificationInput } from "./delivery-verification.ts";
import { relativeToRepo, resolveInsideRepo, type RuntimeContext } from "./runtime.ts";
import { expectedDisplayRows, verifyNumericPage } from "./browser-values.ts";

export type DeliveryBrowserDependencies = { signal?: AbortSignal; playwright?: typeof import("playwright"); expectedResults?: Record<string, unknown>[] };

/** Fixed, unauthenticated browser verification. Numeric mode requires staging-verified expected rows. */
export async function verifyDeliveryBrowser(context: RuntimeContext, input: DeliveryVerificationInput, dependencies: DeliveryBrowserDependencies = {}): Promise<Record<string, unknown>> {
  const invalid = inputError(input);
  if (invalid) return { status: "unverified", reason: invalid };
  if (!input.browser) return { status: "unverified", reason: "browser_not_requested" };
  if (dependencies.signal?.aborted) return { status: "unverified", reason: "cancelled" };
  const base = input.target === "local" ? "http://127.0.0.1:3000" : "https://www.civicresultmaps.org";
  const state = input.state.toUpperCase();
  const url = new URL("/", base);
  url.searchParams.set("state", state);
  url.searchParams.set("year", String(input.year));
  url.searchParams.set("tab", "map");
  url.searchParams.set("mode", "winner");
  const numeric = (input.browserMode ?? "values") === "values";
  if (numeric && !dependencies.expectedResults) return { status: "unverified", reason: "staging_api_values_not_verified" };
  let playwright: typeof import("playwright");
  try { playwright = dependencies.playwright ?? await import("playwright"); }
  catch { return { status: "unverified", reason: "playwright_prerequisite_unavailable" }; }
  let browser: import("playwright").Browser | undefined;
  let page: import("playwright").Page | undefined;
  let cancelled = false;
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const onAbort = () => { cancelled = true; void page?.close().catch(() => undefined); };
  dependencies.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    try { browser = await playwright.chromium.launch({ headless: true }); }
    catch (error) {
      return { status: "unverified", reason: launchReason(error) };
    }
    if (cancelled) return { status: "unverified", reason: "cancelled" };
    const isolated = await browser.newContext({ serviceWorkers: "block", locale: "en-US", viewport: { width: 1440, height: 1000 } });
    page = await isolated.newPage();
    page.on("console", (message) => { if (message.type() === "error" && consoleErrors.length < 20) consoleErrors.push(message.text().slice(0, 1000)); });
    page.on("pageerror", (error) => { if (pageErrors.length < 20) pageErrors.push(error.message.slice(0, 1000)); });
    const response = await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (cancelled) return { status: "unverified", reason: "cancelled" };
    if (!response || !response.ok()) return { status: "unverified", reason: `page_unavailable:${response?.status() ?? "no_response"}`, url: url.toString(), consoleErrors, pageErrors };
    const finalUrl = page.url();
    if (new URL(finalUrl).origin !== new URL(base).origin) return { status: "unverified", reason: "redirected_origin_mismatch", url: url.toString(), finalUrl, consoleErrors, pageErrors };
    if (new URL(finalUrl).searchParams.get("state") !== state || new URL(finalUrl).searchParams.get("year") !== String(input.year)) return { status: "unverified", reason: "redirected_selection_mismatch", url: url.toString(), finalUrl };
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    const verification = await page.evaluate(({ state, year }) => {
      const map = document.querySelector(`section[aria-label="${state} result explorer"]`);
      const table = document.querySelector(`section[aria-label="${state} county results table"]`);
      const selected = document.querySelector(`a[aria-pressed="true"][href*="state=${state}"]`);
      const stateControl = document.querySelector<HTMLSelectElement>('select[aria-label="Workspace state"]');
      const yearControl = document.querySelector<HTMLSelectElement>('select[aria-label="Workspace election year"]');
      const heading = document.querySelector('.dashboard-head .section-label');
      const visible = (element: Element | null) => Boolean(element && (element as HTMLElement).offsetParent !== null);
      return {
        mapVisible: visible(map),
        selectedStateVisible: stateControl ? visible(stateControl) && stateControl.value === state : visible(selected),
        tableVisible: visible(table),
        selectedYearVisible: yearControl ? visible(yearControl) && yearControl.value === String(year) : visible(heading) && heading?.textContent?.trim() === `${year} President`,
      };
    }, { state, year: input.year });
    const numericEvidence = numeric && Object.values(verification).every(Boolean)
      ? await verifyNumericPage(page, expectedDisplayRows(dependencies.expectedResults!, state, input.year), state, input.year) : undefined;
    if (cancelled) return { status: "unverified", reason: "cancelled" };
    const folder = await createContainedRunDirectory(context);
    const screenshot = path.join(folder, "public-ui-smoke.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    await assertContained(context, await realpath(screenshot));
    const assertions = Object.entries(verification).filter(([, passed]) => !passed).map(([name]) => name);
    const runtimeErrors = consoleErrors.length + pageErrors.length;
    return {
      status: runtimeErrors || numericEvidence?.status === "fail" ? "fail" : assertions.length || (numeric && numericEvidence?.status !== "pass") ? "unverified" : "pass",
      url: url.toString(), finalUrl,
      screenshotPath: relativeToRepo(context, screenshot),
      assertions: verification,
      consoleErrors, pageErrors,
      ...(numeric ? { numericEvidence: numericEvidence ?? null } : {}),
      ...(assertions.length ? { reason: `ui_contract_not_verified:${assertions.join(",")}` } : {}),
      ...(runtimeErrors ? { reason: "browser_runtime_errors" } : {}),
      caveat: numeric ? "Numeric checks cover the county result table, winner-map tooltip percentages and a bounded drawer sample; other charts and non-county renderers remain unverified."
        : "Smoke-only mode checks selected state/year and visible surfaces, not displayed values.",
    };
  } catch (error) {
    return { status: "unverified", reason: cancelled ? "cancelled" : `browser_check_failed:${error instanceof Error ? error.message : String(error)}`, consoleErrors, pageErrors };
  } finally { dependencies.signal?.removeEventListener("abort", onAbort); await browser?.close().catch(() => undefined); }
}

export function createDeliveryBrowserAdapter(context: RuntimeContext, dependencies: DeliveryBrowserDependencies = {}) {
  return (input: DeliveryVerificationInput, expectedResults?: Record<string, unknown>[]) => verifyDeliveryBrowser(context, input, { ...dependencies, expectedResults });
}

async function createContainedRunDirectory(context: RuntimeContext) {
  const directory = resolveInsideRepo(context, ".etl/mcp-runs/delivery-browser");
  await ensureContainedDirectory(context, directory);
  const runDirectory = await mkdtemp(path.join(directory, "run-"));
  await assertContained(context, await realpath(runDirectory));
  return runDirectory;
}

async function ensureContainedDirectory(context: RuntimeContext, directory: string) {
  const root = await realpath(context.repoRoot);
  const relative = path.relative(root, directory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("audit_directory_outside_repository");
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    await assertContained(context, await realpath(current));
    current = path.join(current, segment);
    await mkdir(current).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
    await assertContained(context, await realpath(current));
  }
}

async function assertContained(context: RuntimeContext, candidate: string) {
  const root = await realpath(context.repoRoot);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("audit_path_resolves_outside_repository");
}

function inputError(input: DeliveryVerificationInput) {
  if (!input || !/^[A-Za-z]{2}$/.test(input.state ?? "")) return "invalid_state";
  if (![2012, 2016, 2020, 2024].includes(input.year)) return "invalid_year";
  if (input.target !== "local" && input.target !== "production") return "invalid_target";
  if (typeof input.browser !== "boolean" && input.browser !== undefined) return "invalid_browser_flag";
  if (input.browserMode !== undefined && input.browserMode !== "smoke" && input.browserMode !== "values") return "invalid_browser_mode";
  return null;
}

function launchReason(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/executable (does not exist|doesn't exist)|browserType\.launch: Executable/i.test(message)) return "chromium_binary_unavailable";
  if (/\bEPERM\b|\bEACCES\b|access is denied/i.test(message)) return `chromium_spawn_denied:${message}`;
  return `chromium_launch_failed:${message}`;
}
