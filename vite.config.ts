import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Relative base ("./assets/…" rather than "/chords/assets/…").
 *
 * The app is a single static page with no client-side router, so relative URLs
 * work no matter where it's mounted: a GitHub Pages project site under
 * /chords/, a user site or custom domain at the root, `vite preview`, or even
 * opening dist/index.html straight off disk. An absolute base has to match the
 * deploy path exactly and silently 404s every asset when it doesn't — which is
 * a blank page with no useful error.
 */
export default defineConfig({
  base: "./",
  plugins: [react()],
});
