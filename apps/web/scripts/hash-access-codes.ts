/**
 * Turn a plain-text list of access codes into the hashes stored in
 * `apps/web/src/auth/access-codes.json`.
 *
 *   pnpm generate:access-codes path/to/codes.txt            # replaces "hashes"
 *   pnpm generate:access-codes path/to/dev-codes.txt --dev  # replaces "devHashes"
 *
 * One code per line; blank lines and lines starting with # are ignored. Keep the plain
 * list OUTSIDE this repository: only the hashes are committed (CLAUDE.md section 5).
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { hashAccessCode, normalizeAccessCode, type AccessCodeList } from "../src/auth/access.ts";

const listPath = fileURLToPath(new URL("../src/auth/access-codes.json", import.meta.url));
const args = process.argv.slice(2);
const dev = args.includes("--dev");
const codesPath = args.find((arg) => !arg.startsWith("--"));

if (!codesPath) {
  console.error("Usage: pnpm generate:access-codes <codes.txt> [--dev]");
  process.exit(1);
}

const current = JSON.parse(await readFile(listPath, "utf8")) as AccessCodeList;
const codes = (await readFile(codesPath, "utf8"))
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("#"))
  .map(normalizeAccessCode);
const unique = [...new Set(codes)];

if (unique.length === 0) {
  console.error("No codes found in the file. The list was not changed.");
  process.exit(1);
}

const hashes = await Promise.all(unique.map((code) => hashAccessCode(code, current.salt, current.iterations)));
const next: AccessCodeList = dev ? { ...current, devHashes: hashes } : { ...current, hashes };
await writeFile(listPath, `${JSON.stringify(next, null, 2)}\n`);
console.log(`Wrote ${hashes.length} ${dev ? "dev " : ""}code hash(es) to ${listPath}`);
