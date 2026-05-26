// Tiny static file server for dashboard/. Plain Node, no new deps.
// Run: npm run dashboard
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const PORT = Number(process.env.DASHBOARD_PORT ?? 5173);
const ROOT = resolve(process.cwd(), "dashboard");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    let path = decodeURIComponent(url.pathname);
    if (path === "/") path = "/index.html";

    const abs = normalize(join(ROOT, path));
    if (!abs.startsWith(ROOT)) {
      res.writeHead(403).end("forbidden");
      return;
    }

    const s = await stat(abs);
    const file = s.isDirectory() ? join(abs, "index.html") : abs;
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, () => {
  console.log(`SENAQ dashboard → http://localhost:${PORT}/`);
});
