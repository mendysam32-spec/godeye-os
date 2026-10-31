/**
 * Tiny static file server used to bootstrap the Android TWA (Bubblewrap reads
 * the PWA manifest + icons from here during `init`, since the production
 * origin may not be redeployed yet). Run from the repo root:
 *
 *   node scripts/pwa-server.mjs            # port 4173, serves android/_pwa
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "android", "_pwa");
const MIME = {
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const path = join(root, url.pathname === "/" ? "/" : url.pathname.replace(/^\/+/, ""));
    const file = await readFile(path.endsWith("/") ? join(path, "manifest.webmanifest") : path);
    res.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}).listen(4173, "127.0.0.1", () => console.log("pwa-bootstrap server on http://127.0.0.1:4173"));
