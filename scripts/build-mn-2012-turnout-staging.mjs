#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildMinnesota2012TurnoutArtifact,
  serializeMinnesota2012TurnoutArtifact,
  summarizeMinnesota2012TurnoutArtifact,
} from "./lib/mn-2012-turnout.mjs";

function option(args, name, fallback = null) {
  const prefix = "--" + name + "=";
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function parseArguments(args) {
  for (const arg of args) {
    if (
      arg !== "--write"
      && !arg.startsWith("--source-root=")
      && !arg.startsWith("--out=")
    ) {
      throw new Error("Unknown Minnesota 2012 turnout staging option: " + arg);
    }
  }
  return {
    write: args.includes("--write"),
    sourceRoot: option(args, "source-root", process.cwd()),
    outputPath: option(
      args,
      "out",
      ".etl/staging/mn-2012-turnout-staging.json",
    ),
  };
}

function safeOutputPath(root, requested) {
  if (
    path.isAbsolute(requested)
    || requested.includes("\\")
    || requested.split("/").includes("..")
    || !requested.startsWith(".etl/staging/")
    || !requested.endsWith(".json")
  ) {
    throw new Error("Minnesota 2012 turnout staging output must remain under .etl/staging");
  }
  const absolute = path.resolve(root, ...requested.split("/"));
  const allowed = path.resolve(root, ".etl", "staging");
  if (!absolute.startsWith(allowed + path.sep)) {
    throw new Error("Minnesota 2012 turnout staging output escapes .etl/staging");
  }
  return { absolute, relative: requested };
}

export function runMinnesota2012TurnoutStaging(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const parsed = Object.keys(options).length > 0
    ? {
        write: options.write ?? false,
        sourceRoot: options.sourceRoot ?? root,
        outputPath:
          options.outputPath ?? ".etl/staging/mn-2012-turnout-staging.json",
      }
    : parseArguments(process.argv.slice(2));
  const artifact = buildMinnesota2012TurnoutArtifact({
    sourceRoot: parsed.sourceRoot,
  });
  const bytes = serializeMinnesota2012TurnoutArtifact(artifact);
  const summary = summarizeMinnesota2012TurnoutArtifact(artifact, bytes);
  const output = safeOutputPath(
    root,
    parsed.outputPath ?? ".etl/staging/mn-2012-turnout-staging.json",
  );
  if (parsed.write) {
    if (existsSync(output.absolute)) {
      if (!readFileSync(output.absolute).equals(bytes)) {
        throw new Error(
          "Refusing to overwrite different Minnesota 2012 turnout staging bytes",
        );
      }
    } else {
      mkdirSync(path.dirname(output.absolute), { recursive: true });
      writeFileSync(output.absolute, bytes);
    }
  }
  return {
    ...summary,
    mode: parsed.write ? "staging_written" : "dry_run",
    outputPath: output.relative,
  };
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    console.log(JSON.stringify(runMinnesota2012TurnoutStaging(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
