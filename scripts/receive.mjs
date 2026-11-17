// Tiny upload receiver for the bake export. Run: node scripts/receive.mjs
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve(process.cwd(), "bake_src");
await fs.mkdir(OUT, { recursive: true });

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname !== "/upload") {
    res.statusCode = 404;
    return res.end("no");
  }

  const name = (url.searchParams.get("name") || "scene.glb").replace(/[^\w.\-]/g, "_");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const buf = Buffer.concat(chunks);
  await fs.writeFile(path.join(OUT, name), buf);
  console.log("wrote", name, (buf.length / 1e6).toFixed(2), "MB");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end("saved " + name);
});

server.listen(8788, "127.0.0.1", () => console.log("bake receiver on http://127.0.0.1:8788"));
