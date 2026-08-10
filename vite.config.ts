import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * GitHub Pages serves a project repo from a subpath
 * (https://<user>.github.io/chords/), so the build needs a matching `base` or
 * every asset URL 404s. Dev stays at "/" so `./start` is unaffected.
 *
 * Override with BASE_PATH=/whatever/ if the repo is ever renamed, or set
 * BASE_PATH=/ when deploying to a user site or a custom domain.
 */
export default defineConfig(({ command }) => ({
  base: command === "build" ? (process.env.BASE_PATH ?? "/chords/") : "/",
  plugins: [react()],
}));
