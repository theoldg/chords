import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/ui/App";

/**
 * A blank page in production is usually a component throwing during render,
 * which no amount of asset-path checking will catch. Rendering the real App
 * here fails the build instead of failing in the browser.
 */
describe("App renders", () => {
  it("renders the default view without throwing", () => {
    const html = renderToString(<App />);
    expect(html).toContain("Chord Shapes");
    // The default state is Gm(add11) in DAEGAD; if the engine wired up
    // correctly, real shapes are on the page.
    expect(html).toContain("Gm(add11)");
    expect(html).toMatch(/omits the|all tones/);
  });
});
