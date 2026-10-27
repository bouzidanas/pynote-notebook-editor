import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A minimal static file server for the export suite: serves directories under
// URL prefixes, with the CORS header a CDN sends (an exported page opened from
// file:// has an opaque origin, so its fetches are cross-origin).

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

export interface StaticServer {
  origin: string;
  close(): Promise<void>;
}

export async function startStaticServer(mounts: Record<string, string>, port = 0): Promise<StaticServer> {
  const resolve = (pathname: string): string | null => {
    const mount = Object.keys(mounts).find((prefix) => pathname.startsWith(prefix));
    if (!mount) return null;
    const base = path.resolve(mounts[mount]);
    let file = path.join(base, decodeURIComponent(pathname.slice(mount.length)));
    if (!file.startsWith(base)) return null;
    try {
      if (statSync(file).isDirectory()) file = path.join(file, "index.html");
      return statSync(file).isFile() ? file : null;
    } catch {
      return null;
    }
  };

  const server = createServer((request, response) => {
    const file = resolve(new URL(request.url ?? "/", "http://localhost").pathname);
    if (!file) {
      response.writeHead(404, { "Access-Control-Allow-Origin": "*" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "Content-Length": statSync(file).size,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    });
    createReadStream(file).pipe(response);
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

// node e2e/export/static-server.ts <folder> <port>: serve a folder on its own
// (the component tests serve Astro's static build with it).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [folder, port] = process.argv.slice(2);
  void startStaticServer({ "/": path.resolve(folder) }, Number(port)).then((server) => console.log(`serving ${folder} at ${server.origin}`));
}
