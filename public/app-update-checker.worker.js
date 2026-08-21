self.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || message.type !== "check" || typeof message.url !== "string") return;
  void checkForUpdate(message);
});

async function checkForUpdate(message) {
  try {
    const url = new URL(message.url);
    if (url.origin !== self.location.origin) return;
    url.searchParams.set("t", Date.now().toString());
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const latest = await response.json();
    const changed =
      latest.version !== message.version ||
      (latest.commit && message.commit && latest.commit !== message.commit);
    self.postMessage({ type: changed ? "changed" : "unchanged" });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
