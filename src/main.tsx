import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/*
 * Register the service worker so the app is installable and works offline.
 * "./sw.js" resolves against the *document* URL, so it lands at the site root
 * whatever subpath we're mounted at, and the worker's scope follows. (Resolving
 * against import.meta.url would point into the hashed assets/ directory
 * instead.) Registration waits for `load` so it never competes with the first
 * render. Dev is skipped — a caching worker while you're editing is misery.
 */
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("Service worker registration failed; the app still works online.", err);
    });
  });
}
