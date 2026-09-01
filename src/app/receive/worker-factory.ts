// Route-local module worker fetched by URL. The browser caches it, and the service worker
// precaches it for offline use.
export function createDecodeWorker(): Worker {
  return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
}
