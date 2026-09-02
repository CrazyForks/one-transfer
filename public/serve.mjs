import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL(".", import.meta.url));
const host = process.env.ONE_TRANSFER_HOST?.trim() || "127.0.0.1";
const portText = process.argv[2] ?? process.env.ONE_TRANSFER_PORT ?? "8080";
const port = Number(portText);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid port: ${portText}`);
  process.exit(1);
}

const contentTypes = new Map([
  [".bat", "application/octet-stream"],
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webmanifest", "application/manifest+json"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function isInsideRoot(filePath) {
  const relativePath = relative(rootDirectory, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

async function existingFile(filePath) {
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) return { filePath, fileStat };
    if (!fileStat.isDirectory()) return null;
    const indexPath = resolve(filePath, "index.html");
    const indexStat = await stat(indexPath);
    return indexStat.isFile() ? { filePath: indexPath, fileStat: indexStat } : null;
  } catch {
    return null;
  }
}

async function resolveRequest(request) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  } catch {
    return null;
  }

  const requestedPath = resolve(rootDirectory, pathname.replace(/^\/+/, ""));
  if (!isInsideRoot(requestedPath)) return null;

  const matchedFile = await existingFile(requestedPath);
  if (matchedFile) return matchedFile;

  const acceptsHtml = request.headers.accept?.includes("text/html") ?? false;
  if (!acceptsHtml && extname(pathname)) return null;
  return existingFile(resolve(rootDirectory, "index.html"));
}

function cacheControl(filePath) {
  const relativePath = relative(rootDirectory, filePath).replaceAll("\\", "/");
  if (relativePath.startsWith("assets/")) return "public, max-age=31536000, immutable";
  return "no-cache";
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method Not Allowed");
    return;
  }

  const file = await resolveRequest(request);
  if (!file) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
    return;
  }

  response.writeHead(200, {
    "Cache-Control": cacheControl(file.filePath),
    "Content-Length": file.fileStat.size,
    "Content-Type": contentTypes.get(extname(file.filePath).toLowerCase()) ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }

  const stream = createReadStream(file.filePath);
  stream.on("error", () => response.destroy());
  stream.pipe(response);
});

server.on("error", (error) => {
  console.error(`Unable to start One Transfer: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  console.log(`One Transfer is running at http://${displayHost}:${port}`);
  console.log(`Serving ${rootDirectory}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
