import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { prerender } from "./prerender";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CDN = "https://dntgnyxcho2sk.cloudfront.net";

// `vite dev` only: /cdn/* is fetched from the game CDN once and kept in
// .cdn-cache, so reloads while developing don't re-download 15 MB bundles.
// The built site has no proxy; it fetches the CDN directly (it sends ACAO *).
function cdnCache(): Plugin {
  const root = path.resolve(__dirname, ".cdn-cache");
  return {
    name: "cdn-cache",
    configureServer(server) {
      server.middlewares.use("/cdn", async (req, res) => {
        const rel = decodeURIComponent((req.url || "/").split("?")[0]);
        const file = path.join(root, rel);
        if (!file.startsWith(root)) { res.statusCode = 400; return res.end(); }
        try {
          // Catalog .hash/.bin are overwritten in place on each game update:
          // never cache those, or dev would never see an update.
          if (/\.(hash|bin)$/.test(rel)) {
            const r = await fetch(CDN + rel);
            res.statusCode = r.status;
            return res.end(Buffer.from(await r.arrayBuffer()));
          }
          // Range reads (src/unity/remote.ts): from the cached file when there
          // is one, else passed through uncached so dev behaves like the CDN.
          const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || "");
          if (range) {
            const [start, end] = [Number(range[1]), Number(range[2])];
            res.setHeader("Access-Control-Allow-Origin", "*");
            if (fs.existsSync(file)) {
              const size = fs.statSync(file).size;
              res.statusCode = 206;
              res.setHeader("Content-Range", `bytes ${start}-${Math.min(end, size - 1)}/${size}`);
              return fs.createReadStream(file, { start, end: Math.min(end, size - 1) }).pipe(res);
            }
            const r = await fetch(CDN + rel.split("/").map(encodeURIComponent).join("/"), { headers: { Range: req.headers.range! } });
            res.statusCode = r.status;
            return res.end(Buffer.from(await r.arrayBuffer()));
          }
          if (!fs.existsSync(file)) {
            // CloudFront occasionally drops a connection: retry before failing,
            // and write via a temp file so parallel requests never see half a bundle.
            let r: Response | null = null;
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                r = await fetch(CDN + rel.split("/").map(encodeURIComponent).join("/"));
                if (r.ok || r.status === 403 || r.status === 404) break;
              } catch (err) {
                if (attempt === 2) throw err;
              }
              await new Promise((ok) => setTimeout(ok, 500 * (attempt + 1)));
            }
            if (!r || !r.ok) { res.statusCode = r?.status ?? 502; return res.end(); }
            const body = Buffer.from(await r.arrayBuffer());
            fs.mkdirSync(path.dirname(file), { recursive: true });
            const tmp = `${file}.${process.pid}.${Date.now()}.part`;
            fs.writeFileSync(tmp, body);
            fs.renameSync(tmp, file);
          }
          res.setHeader("Access-Control-Allow-Origin", "*");
          fs.createReadStream(file).pipe(res);
        } catch (err) {
          res.statusCode = 502;
          res.end(String(err));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), cdnCache(), prerender()],
  base: "/",
  worker: { format: "es" },
});
