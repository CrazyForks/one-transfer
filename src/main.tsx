import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "@/app";
import "@/styles.css";

const routerBasePath = new URL("../", import.meta.url).pathname.replace(/\/$/, "") || "/";

if ("serviceWorker" in navigator) {
  const wasControlled = navigator.serviceWorker.controller !== null;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!wasControlled || reloading) return;
    reloading = true;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter basename={routerBasePath}>
    <App />
  </BrowserRouter>,
);
