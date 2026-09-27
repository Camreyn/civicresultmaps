import { registerHooks } from "node:module";
import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Resolves only the trusted app's source-local aliases during a fixed import.
 * No caller-selected paths, environment aliases, or generated code are accepted. */
export async function loadRehearsalDataAccess() {
  const root = realpathSync(fileURLToPath(new URL("../../src/", import.meta.url)));
  const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith("file:")) {
      const parent = fileURLToPath(context.parentURL); const relative = path.relative(root, parent);
      if (!relative.startsWith("..") && !path.isAbsolute(relative) && (specifier.startsWith("@/") || (specifier.startsWith(".") && !path.extname(specifier)))) {
        const stem = specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(parent), specifier);
        for (const candidate of [stem, `${stem}.ts`, `${stem}.tsx`, `${stem}.js`]) {
          if (!existsSync(candidate) || !statSync(candidate).isFile()) continue;
          const resolved = realpathSync(candidate), within = path.relative(root, resolved);
          if (within.startsWith("..") || path.isAbsolute(within)) throw new Error("Rehearsal loader import escaped trusted source root.");
          return nextResolve(pathToFileURL(resolved).href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  } });
  try { return await import("../../src/lib/data-access.ts"); }
  finally { hooks.deregister(); }
}
