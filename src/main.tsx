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
 * Hold the app still when the phone is tilted.
 *
 * You play sitting down with the instrument across your lap, which means the
 * phone spends its life at an angle that the accelerometer keeps reading as a
 * rotation. Reflowing a page of chord diagrams mid-bar is the worst moment to
 * do it, so the app asks to be pinned.
 *
 * "natural" rather than "portrait": it is the orientation the device itself
 * considers upright, so a phone locks portrait and a tablet locks landscape,
 * without this code having to guess which it is on. That is as close to
 * "follow the device" as the platform allows — there is no web API that
 * exposes the OS auto-rotate switch, so an app can ask to be locked or not,
 * and nothing in between.
 *
 * The request only has force where the app owns the window: installed and
 * running standalone, or fullscreen. In a browser tab it rejects, and on iOS
 * the method does not exist at all. Every one of those is a no-op that leaves
 * rotation exactly as the OS wants it — which is why the failure is swallowed
 * rather than reported.
 */
const orientation = screen.orientation as unknown as
  | { lock?(o: string): Promise<unknown> }
  | undefined;
try {
  orientation?.lock?.("natural").catch(() => {});
} catch {
  /* Older implementations throw synchronously instead of rejecting. */
}

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
