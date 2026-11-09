#!/usr/bin/env node
// Pack every folder under skill-src/ into public/skills/<name>.zip.
// Usage: npm run skills:pack
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { zipSync } from "fflate";

const root = process.cwd();
const srcRoot = join(root, "skill-src");
const outRoot = join(root, "public", "skills");
const IGNORE = new Set(["__pycache__", ".git", "node_modules", ".DS_Store", "Thumbs.db", ".venv", "venv"]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.has(entry.name)) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, files);
    else if (entry.isFile()) files.push(abs);
  }
  return files;
}

mkdirSync(outRoot, { recursive: true });
const skills = readdirSync(srcRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

if (!skills.length) {
  console.error(`No skill folders found in ${srcRoot}`);
  process.exit(1);
}

for (const name of skills) {
  const dir = join(srcRoot, name);
  const entries = {};
  for (const abs of walk(dir)) {
    const rel = relative(dir, abs).split(sep).join("/");
    entries[rel] = new Uint8Array(readFileSync(abs));
  }
  const zipped = zipSync(entries, { level: 6 });
  const out = join(outRoot, `${name}.zip`);
  writeFileSync(out, zipped);
  console.log(`${name}: ${Object.keys(entries).length} files -> public/skills/${name}.zip (${zipped.length} bytes)`);
}
