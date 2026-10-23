import test from "node:test";
import assert from "node:assert/strict";
import { formatCsv } from "../src/lib/utils.ts";

test("CSV 1: Handles standard values properly", () => {
  const headers = ["nodeId", "rssi", "battery"];
  const rows = [
    ["N01", -65, 88],
    ["N02", -78, 64],
  ];
  const csv = formatCsv(headers, rows);
  assert.equal(csv, '"nodeId","rssi","battery"\r\n"N01","-65","88"\r\n"N02","-78","64"');
});

test("CSV 2: Protects against formula injection vulnerabilities", () => {
  const headers = ["name", "notes"];
  const rows = [
    ["=SUM(A1:A10)", "+cmd|' /C calc'!A0"],
    ["-danger", "@malicious"],
  ];
  const csv = formatCsv(headers, rows);
  assert.ok(csv.includes('"\'=SUM(A1:A10)"'), "Prepends single quote to = formula");
  assert.ok(csv.includes("\"'+cmd|' /C calc'!A0\""), "Prepends single quote to + formula");
  assert.ok(csv.includes('"\'-danger"'), "Prepends single quote to - formula");
  assert.ok(csv.includes('"\'@malicious"'), "Prepends single quote to @ formula");
});

test("CSV 3: Escapes double quotes and multi-line strings per RFC-4180", () => {
  const headers = ["field", "description"];
  const rows = [["rubble", 'Heavy "Grade A" concrete,\nvoid detected']];
  const csv = formatCsv(headers, rows);
  assert.ok(csv.includes('""Grade A""'), "Double quotes must be escaped as two double quotes");
  assert.ok(csv.includes("\n"), "Multi-line values preserved inside quoted cell");
});

test("CSV 4: Handles empty datasets and nullish values gracefully", () => {
  const emptyCsv = formatCsv([], []);
  assert.equal(emptyCsv, "");

  const nullishCsv = formatCsv(["id", "notes"], [[null, undefined]]);
  assert.equal(nullishCsv, '"id","notes"\r\n"",""');
});
