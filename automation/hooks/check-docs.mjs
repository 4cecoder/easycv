#!/usr/bin/env bun
// Enforces doc comments on newly added exported/public functions and classes.
//
// Scoped to ADDED lines only (never pre-existing code), so this can go live
// without a repo-wide documentation backfill: `git diff` for the requested
// range is inspected, and only lines the range actually introduces are
// checked against the file's current content. Existing undocumented code is
// never flagged unless a hunk touches it directly.
//
// Usage:
//   bun automation/hooks/check-docs.mjs --staged
//   bun automation/hooks/check-docs.mjs --range <base>..<head>

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const mode = args[0];
let diffArgs;
if (mode === "--staged") {
  diffArgs = ["diff", "--cached", "--unified=0", "--diff-filter=ACM"];
} else if (mode === "--range") {
  const range = args[1];
  if (!range) {
    console.error("check-docs: --range requires <base>..<head>");
    process.exit(2);
  }
  diffArgs = ["diff", range, "--unified=0", "--diff-filter=ACM"];
} else {
  console.error("check-docs: pass --staged or --range <base>..<head>");
  process.exit(2);
}

const diff = execFileSync("git", diffArgs, { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 });

const TS_EXT = /\.(ts|tsx)$/;
const PY_EXT = /\.py$/;
const SKIP_PATH = /(\.test\.|\.spec\.|__tests__|\/tests\/|\/_generated\/|\.d\.ts$)/;

// Public TS surface worth documenting: top-level exported functions/classes/
// arrow-const assignments. Skips re-exports (`export { x }`) and type-only
// exports, which don't carry runtime behavior worth a comment.
const TS_DECL = /^\+\s*export\s+(async function|function|class|const\s+\w+\s*(:[^=]+)?=\s*(async\s*)?\()/;
const PY_DECL = /^\+(def |class )/; // top-level (unindented) only

let currentFile = null;
let newLineNo = 0;
const violations = [];

function checkTsDoc(filePath, lineNo) {
  const lines = readFileSync(filePath, "utf8").split("\n");
  const before = lines[lineNo - 2] ?? ""; // lineNo is 1-indexed; line above the decl
  const trimmed = before.trim();
  if (trimmed.endsWith("*/") || trimmed.startsWith("//")) return true;
  return false;
}

function checkPyDoc(filePath, lineNo) {
  const lines = readFileSync(filePath, "utf8").split("\n");
  // Find the end of the def/class signature (handles multi-line signatures)
  let i = lineNo - 1;
  while (i < lines.length && !lines[i].trimEnd().endsWith(":")) i++;
  const bodyFirst = (lines[i + 1] ?? "").trim();
  return bodyFirst.startsWith('"""') || bodyFirst.startsWith("'''");
}

for (const line of diff.split("\n")) {
  if (line.startsWith("+++ b/")) {
    currentFile = line.slice(6);
    continue;
  }
  const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
  if (hunkMatch) {
    newLineNo = parseInt(hunkMatch[1], 10);
    continue;
  }
  if (!currentFile || SKIP_PATH.test(currentFile)) {
    if (line.startsWith("+") && !line.startsWith("+++")) newLineNo++;
    continue;
  }
  if (line.startsWith("+") && !line.startsWith("+++")) {
    if (TS_EXT.test(currentFile) && TS_DECL.test(line)) {
      if (!checkTsDoc(currentFile, newLineNo)) {
        violations.push(`${currentFile}:${newLineNo}: new exported declaration needs a doc comment`);
      }
    } else if (PY_EXT.test(currentFile) && PY_DECL.test(line) && !line.startsWith("+    ") && !line.startsWith("+\t")) {
      if (!checkPyDoc(currentFile, newLineNo)) {
        violations.push(`${currentFile}:${newLineNo}: new top-level def/class needs a docstring`);
      }
    }
    newLineNo++;
  }
}

if (violations.length > 0) {
  console.error("check-docs: missing documentation on new public code:\n");
  for (const v of violations) console.error("  " + v);
  console.error("\nAdd a doc comment (// or /** */ for TS, docstring for Python) directly above the declaration.");
  process.exit(1);
}
process.exit(0);
