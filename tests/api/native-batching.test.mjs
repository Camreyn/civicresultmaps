import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  chunkRows,
  dedupeRowsLastWins,
} from "../../src/db/native-import.ts";

test("native rows are chunked into bounded promotion statements", () => {
  const rows = Array.from({ length: 2501 }, (_, index) => index);
  assert.deepEqual(chunkRows(rows).map((chunk) => chunk.length), [1000, 1000, 501]);
  assert.deepEqual(chunkRows([], 25), []);
  assert.throws(() => chunkRows(rows, 0), /positive integer/);
});

test("native batch dedupe preserves sequential last-write-wins semantics", () => {
  const rows = [
    { key: "a", value: 1 },
    { key: "b", value: 2 },
    { key: "a", value: 3 },
  ];
  assert.deepEqual(
    dedupeRowsLastWins(rows, (row) => row.key),
    [
      { key: "a", value: 3 },
      { key: "b", value: 2 },
    ],
  );
});

test("all dominant native row writers use JSONB recordset batches", () => {
  const importer = readFileSync("src/db/native-import.ts", "utf8");

  assert.ok(importer.split("jsonb_to_recordset(").length - 1 >= 6);
  for (const records of [
    "resultJurisdictionWrites",
    "resultWriteRecords",
    "reviewWriteRecords",
    "indicatorWriteRecords",
    "turnoutWriteRecords",
    "historicalWriteRecords",
  ]) {
    assert.ok(importer.includes(records), "missing native batch " + records);
  }
  assert.ok(importer.includes("for (const jurisdictionBatch of chunkRows(resultJurisdictionWrites))"));
  assert.ok(importer.includes("severity numeric"));
  assert.equal(importer.includes("severity text"), false);
  assert.ok(importer.includes("runNeonTransaction"));
  assert.ok(importer.includes("bumpPublicDataRevision"));
});