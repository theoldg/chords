import { useEffect } from "react";

/**
 * Light, dark, or whatever the OS says.
 *
 * The palette itself lives in styles.css and is written with `light-dark()`, so
 * every token has both values in one place and the *choice* is made by a single
 * `color-scheme`. All this has to do is say which of the three modes is in
 * force: `data-theme` on <html> flips `color-scheme` to a fixed value, and its
 * absence leaves it as `light dark`, i.e. following the system.
 *
 * "system" is a real third state, not the absence of a preference — someone who
 * has explicitly chosen to follow the OS should keep following it when the OS
 * changes, which is why it round-trips through storage like the other two.
 */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  system: "Auto",
  light: "Light",
  dark: "Dark",
};

/** Kept in step with --bg in styles.css. */
const THEME_COLOURS = {
  light: "#f6f5f2",
  dark: "#16151a",
} as const;

export function useTheme(theme: Theme): void {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;

    /*
     * The browser chrome — the status bar of the installed app, the tab strip —
     * is painted from <meta name="theme-color">, and index.html ships one per
     * colour scheme. Those two media queries between them match every case, and
     * the browser takes the first tag that matches, so an explicit choice can
     * only win by overwriting both. Each pass recomputes from the tag's own
     * media query rather than from a saved original, so going back to "system"
     * restores them without anything having to be remembered.
     */
    for (const meta of document.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"][media]',
    )) {
      const own = meta.media.includes("dark") ? THEME_COLOURS.dark : THEME_COLOURS.light;
      meta.content = theme === "system" ? own : THEME_COLOURS[theme];
    }
  }, [theme]);
}
