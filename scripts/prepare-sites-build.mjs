#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const index = path.join(dist, "client", "index.html");
const server = path.join(dist, "server", "index.js");
const hosting = path.join(root, ".openai", "hosting.json");

for (const file of [index, server, hosting]) {
  if (!existsSync(file)) throw new Error("Missing Sites build input: " + file);
}

mkdirSync(path.join(dist, ".openai"), { recursive: true });
rmSync(path.join(dist, "src"), { recursive: true, force: true });
copyFileSync(hosting, path.join(dist, ".openai", "hosting.json"));

console.log("Prepared Sites build: bundled dist/server/index.js and dist/.openai/hosting.json");
