import {
  WORKSPACE_R_MAX_INPUT_BYTES,
  WORKSPACE_R_MAX_OUTPUT_CELL_LENGTH,
  WORKSPACE_R_MAX_OUTPUT_BYTES,
  WORKSPACE_R_MAX_OUTPUT_COLUMNS,
  WORKSPACE_R_MAX_OUTPUT_ROWS,
  WORKSPACE_R_MAX_OUTPUT_VALUES,
  WORKSPACE_R_CALCULATION_MAX_SOURCE_LENGTH,
  WORKSPACE_R_RUNTIME_PUBLIC_PATH,
} from "./workspace-r-calculation.ts";

export const WORKSPACE_R_RUNTIME_MESSAGE_SCOPE = "civicresultmaps:r-runtime:v1";

export function workspaceRRuntimeDocument(parentOrigin: string) {
  const runtimeOrigin = normalizeParentOrigin(parentOrigin);
  const runtimeBaseUrl = `${runtimeOrigin}${WORKSPACE_R_RUNTIME_PUBLIC_PATH}`;
  const runtimeModuleUrl = `${runtimeBaseUrl}webr.js`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; child-src blob:; connect-src ${runtimeBaseUrl}; form-action 'none'; object-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: ${runtimeBaseUrl}; style-src 'unsafe-inline'; worker-src blob:">
  <meta name="referrer" content="no-referrer">
  <title>Isolated browser R runtime</title>
</head>
<body>
  <script type="module">
    const SCOPE = ${JSON.stringify(WORKSPACE_R_RUNTIME_MESSAGE_SCOPE)};
    const RUNTIME_MODULE_URL = ${JSON.stringify(runtimeModuleUrl)};
    const RUNTIME_BASE_URL = ${JSON.stringify(runtimeBaseUrl)};
    const MAX_INPUT_BYTES = ${WORKSPACE_R_MAX_INPUT_BYTES};
    const MAX_OUTPUT_BYTES = ${WORKSPACE_R_MAX_OUTPUT_BYTES};
    const MAX_SOURCE_LENGTH = ${WORKSPACE_R_CALCULATION_MAX_SOURCE_LENGTH};
    let active = false;
    let runtimePromise;

    const post = (type, data = {}) => parent.postMessage({ scope: SCOPE, type, ...data }, "*");
    const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
    const errorMessage = (error) => {
      const message = error instanceof Error ? error.message : String(error || "Unknown browser R error");
      return message.slice(0, 1_000);
    };
    const byteLength = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

    function validRunMessage(message) {
      return isRecord(message)
        && message.scope === SCOPE
        && message.type === "run"
        && typeof message.requestId === "string"
        && message.requestId.length > 0
        && message.requestId.length <= 128
        && isRecord(message.payload)
        && typeof message.payload.source === "string"
        && message.payload.source.length > 0
        && message.payload.source.length <= MAX_SOURCE_LENGTH
        && isRecord(message.payload.inputs)
        && byteLength(message.payload.inputs) <= MAX_INPUT_BYTES;
    }

    async function verifyWorkerSupport(requestId) {
      post("status", { requestId, stage: "worker-probe-starting" });
      const workerUrl = URL.createObjectURL(new Blob([
        "self.postMessage({ type: 'workspace-worker-probe-ready' });",
      ], { type: "text/javascript" }));
      const worker = new Worker(workerUrl);
      try {
        await new Promise((resolve, reject) => {
          const timer = window.setTimeout(
            () => reject(new Error("The isolated browser frame could not start a Web Worker.")),
            5_000,
          );
          worker.onerror = (event) => {
            window.clearTimeout(timer);
            reject(new Error(event.message || "The isolated browser frame blocked its Web Worker."));
          };
          worker.onmessage = (event) => {
            if (event.data?.type !== "workspace-worker-probe-ready") return;
            window.clearTimeout(timer);
            resolve();
          };
        });
        post("status", { requestId, stage: "worker-probe-ready" });
      } finally {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
      }
    }

    async function getRuntime(requestId) {
      if (!runtimePromise) {
        post("status", { requestId, stage: "initializing" });
        await verifyWorkerSupport(requestId);
        runtimePromise = import(RUNTIME_MODULE_URL).then(async ({ ChannelType, WebR }) => {
          const webR = new WebR({
            RArgs: ["--quiet", "--no-save", "--no-restore", "--no-environ", "--no-site-file", "--no-init-file"],
            baseUrl: RUNTIME_BASE_URL,
            channelType: ChannelType.PostMessage,
            interactive: false,
          });
          post("status", { requestId, stage: "worker-starting" });
          await webR.init();
          post("status", { requestId, stage: "runtime-ready" });
          return webR;
        }).catch((error) => {
          runtimePromise = undefined;
          throw error;
        });
      }
      return runtimePromise;
    }

    function wrappedFormula(source) {
      return [
        "local({",
        "  .crm_value <- (function() {",
        source,
        "  })()",
        "  if (is.data.frame(.crm_value)) {",
        "    .crm_value <- .crm_value[seq_len(min(nrow(.crm_value), ${WORKSPACE_R_MAX_OUTPUT_ROWS}L)), seq_len(min(ncol(.crm_value), ${WORKSPACE_R_MAX_OUTPUT_COLUMNS}L)), drop = FALSE]",
        "    .crm_value[] <- lapply(.crm_value, function(x) {",
        "      if (!is.atomic(x)) return(rep('[unsupported R column]', length(x)))",
        "      x <- as.vector(x)",
        "      if (is.character(x)) substr(x, 1L, ${WORKSPACE_R_MAX_OUTPUT_CELL_LENGTH}L) else x",
        "    })",
        "  } else if (is.atomic(.crm_value)) {",
        "    .crm_value <- head(as.vector(.crm_value), ${WORKSPACE_R_MAX_OUTPUT_VALUES}L)",
        "    if (is.character(.crm_value)) .crm_value <- substr(.crm_value, 1L, ${WORKSPACE_R_MAX_OUTPUT_CELL_LENGTH}L)",
        "  } else if (is.list(.crm_value)) {",
        "    .crm_value <- head(.crm_value, ${WORKSPACE_R_MAX_OUTPUT_VALUES}L)",
        "    .crm_value <- lapply(.crm_value, function(x) {",
        "      if (!is.atomic(x)) return('[unsupported nested R object]')",
        "      x <- head(as.vector(x), 1L)",
        "      if (is.character(x)) substr(x, 1L, ${WORKSPACE_R_MAX_OUTPUT_CELL_LENGTH}L) else x",
        "    })",
        "  } else {",
        "    .crm_value <- '[unsupported R object]'",
        "  }",
        "  if (!is.null(names(.crm_value))) names(.crm_value) <- substr(names(.crm_value), 1L, ${WORKSPACE_R_MAX_OUTPUT_CELL_LENGTH}L)",
        "  .crm_value",
        "})",
      ].join("\\n");
    }

    async function run(requestId, payload) {
      if (active) return;
      active = true;
      let shelter;
      try {
        const webR = await getRuntime(requestId);
        shelter = await new webR.Shelter();
        const crmContext = await new shelter.RList(payload.inputs.context);
        const crmResults = await new shelter.RDataFrame(payload.inputs.results);
        const crmViewResults = await new shelter.RDataFrame(payload.inputs.viewResults);
        const crmVotes = await new shelter.RDataFrame(payload.inputs.votes);
        const crmViewVotes = await new shelter.RDataFrame(payload.inputs.viewVotes);
        const env = await new shelter.REnvironment({
          crm_context: crmContext,
          crm_results: crmResults,
          crm_view_results: crmViewResults,
          crm_votes: crmVotes,
          crm_view_votes: crmViewVotes,
        });
        post("status", { requestId, stage: "executing" });
        const result = await shelter.evalR(wrappedFormula(payload.source), {
          captureConditions: true,
          captureGraphics: false,
          captureStreams: true,
          env,
          throwJsException: true,
          withHandlers: true,
        });
        const isDataFrame = typeof result.isDataFrame === "function" && await result.isDataFrame();
        const output = isDataFrame
          ? { format: "data-frame", rows: await result.toD3() }
          : { format: "r-object", value: await result.toJs({ depth: 0 }) };
        if (byteLength(output) > MAX_OUTPUT_BYTES) {
          throw new Error("The R result exceeded the browser output byte limit.");
        }
        post("result", {
          output,
          requestId,
          runtimeVersion: webR.version,
          versionR: webR.versionR,
        });
      } catch (error) {
        post("error", { message: errorMessage(error), requestId });
      } finally {
        if (shelter) await shelter.purge().catch(() => undefined);
        active = false;
      }
    }

    const announceBridge = () => post("bridge-ready");
    const bridgeTimer = window.setInterval(announceBridge, 250);
    const onMessage = (event) => {
      if (event.source !== parent || !validRunMessage(event.data)) return;
      window.clearInterval(bridgeTimer);
      window.removeEventListener("message", onMessage);
      void run(event.data.requestId, event.data.payload);
    };

    window.addEventListener("message", onMessage);
    announceBridge();
  </script>
</body>
</html>`;
}

function normalizeParentOrigin(parentOrigin: string) {
  const parsed = new URL(parentOrigin);
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.origin !== parentOrigin) {
    throw new Error("The browser R runtime requires an exact HTTP(S) parent origin.");
  }
  return parsed.origin;
}
