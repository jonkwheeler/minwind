import fs from "node:fs";
import http from "node:http";
import path from "node:path";

// Static file server for the harness (KTD8). One server on one port with a
// swappable root: the off and on crawls share an origin, so computed-style
// values that embed the origin (a resolved url() would carry
// http://127.0.0.1:PORT) compare equal across builds. Every response is
// no-store so the second crawl can never observe the first build's bytes
// through the browser cache — the crawled route URLs are identical.

export interface StaticServer {
  origin: string;
  setRoot(dir: string): void;
  close(): Promise<void>;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
};

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  // '' is the root itself (the "/" route), which directory-index resolution
  // then maps to its index.html.
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function resolveRequest(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const candidate = path.join(root, decoded);
  if (!isInside(root, candidate)) return null;

  if (fs.existsSync(candidate)) {
    const stat = fs.statSync(candidate);
    if (stat.isFile()) return candidate;
    if (stat.isDirectory()) {
      const index = path.join(candidate, "index.html");
      if (fs.existsSync(index) && fs.statSync(index).isFile()) return index;
    }
    return null;
  }
  // Extensionless routes resolve like a static host: /foo -> /foo.html,
  // then /foo/index.html.
  if (path.extname(candidate) === "") {
    const html = `${candidate}.html`;
    if (fs.existsSync(html) && fs.statSync(html).isFile()) return html;
    const index = path.join(candidate, "index.html");
    if (fs.existsSync(index) && fs.statSync(index).isFile()) return index;
  }
  return null;
}

export function serveStatic(root: string): Promise<StaticServer> {
  let currentRoot = path.resolve(root);

  const server = http.createServer(function (request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const file =
      request.method === "GET" || request.method === "HEAD"
        ? resolveRequest(currentRoot, url.pathname)
        : null;
    if (file === null) {
      response.writeHead(404, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end("not found");
      return;
    }
    response.writeHead(200, {
      "content-type":
        CONTENT_TYPES[path.extname(file).toLowerCase()] ??
        "application/octet-stream",
      "cache-control": "no-store",
      "content-length": fs.statSync(file).size,
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    fs.createReadStream(file).pipe(response);
  });

  return new Promise(function (resolve, reject) {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", function () {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("minwind-compare: static server did not bind a port"));
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        setRoot: function (dir: string) {
          currentRoot = path.resolve(dir);
        },
        close: function () {
          return new Promise(function (done, failed) {
            server.close(function (error) {
              if (error) failed(error);
              else done();
            });
          });
        },
      });
    });
  });
}
