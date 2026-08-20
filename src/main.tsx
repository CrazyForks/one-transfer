import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";

import { App } from "@/app";
import "@/styles.css";

if (!window.location.hash) {
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}#/`,
  );
}

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
  <HashRouter>
    <App />
  </HashRouter>,
);
