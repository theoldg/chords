import { describe, expect, it } from "vitest";
import { DEFAULT_BUILDER } from "../src/theory/chord";
import { DEFAULT_SEARCH_OPTIONS } from "../src/theory/search";
import { asBoolean, asOneOf, asText, reviveBuilder, reviveOptions } from "../src/ui/settings";

/*
 * Stored settings are the one input to this app that nobody typed: they arrive
 * from a previous build, a devtools edit, or a truncated write. The revivers
 * are the only thing between that and `buildChord()`, which indexes records by
 * the stored value and throws on a miss — so these tests are less about
 * round-tripping and more about what happens when the storage lies.
 */

describe("simple revivers", () => {
  it("takes text within the cap and rejects the rest", () => {
    expect(asText(8)("DADGAD")).toBe("DADGAD");
    expect(asText(4)("EbAbDbGbBbEb")).toBeNull();
    expect(asText(8)(42)).toBeNull();
  });

  it("rejects a boolean that arrived as a string", () => {
    expect(asBoolean(true)).toBe(true);
    expect(asBoolean(false)).toBe(false);
    expect(asBoolean("true")).toBeNull();
  });

  it("only accepts listed values", () => {
    const mode = asOneOf(["progression", "blocks"] as const);
    expect(mode("blocks")).toBe("blocks");
    expect(mode("Blocks")).toBeNull();
    expect(mode(null)).toBeNull();
  });
});

describe("reviveOptions", () => {
  it("restores what the UI can set", () => {
    const got = reviveOptions({
      maxSpan: 3,
      maxFret: 12,
      minSoundingStrings: 5,
      allowRootOmission: true,
      allowInnerMutes: true,
    });
    expect(got).toMatchObject({
      maxSpan: 3,
      maxFret: 12,
      minSoundingStrings: 5,
      allowRootOmission: true,
      allowInnerMutes: true,
    });
  });

  it("clamps to the range its own slider offers", () => {
    const got = reviveOptions({ maxSpan: 99, maxFret: -4, minSoundingStrings: 3.6 })!;
    expect(got.maxSpan).toBe(6);
    expect(got.maxFret).toBe(4);
    expect(got.minSoundingStrings).toBe(4);
  });

  it("ignores nonsense and non-numbers, falling back per field", () => {
    const got = reviveOptions({ maxSpan: "wide", maxFret: NaN, allowInnerMutes: 1 })!;
    expect(got.maxSpan).toBe(DEFAULT_SEARCH_OPTIONS.maxSpan);
    expect(got.maxFret).toBe(DEFAULT_SEARCH_OPTIONS.maxFret);
    expect(got.allowInnerMutes).toBe(DEFAULT_SEARCH_OPTIONS.allowInnerMutes);
  });

  it("never takes the engine knobs from storage", () => {
    const got = reviveOptions({ maxResults: 100000, collapseMuteVariants: false })!;
    expect(got.maxResults).toBe(DEFAULT_SEARCH_OPTIONS.maxResults);
    expect(got.collapseMuteVariants).toBe(DEFAULT_SEARCH_OPTIONS.collapseMuteVariants);
  });

  it("rejects a value that isn't an object at all", () => {
    expect(reviveOptions("{}")).toBeNull();
    expect(reviveOptions([1, 2])).toBeNull();
    expect(reviveOptions(null)).toBeNull();
  });
});

describe("reviveBuilder", () => {
  it("round-trips a real builder state", () => {
    const state = {
      root: "Eb",
      triad: "maj",
      seventh: "b7",
      ext9: "on",
      ext11: "add",
      ext13: "off",
      alterations: ["#9", "b13"],
      bass: "Bb",
    };
    expect(reviveBuilder(state)).toEqual(state);
  });

  it("replaces only the fields it can't recognise", () => {
    const got = reviveBuilder({ root: "H", triad: "min", seventh: "maj7" })!;
    expect(got.root).toBe(DEFAULT_BUILDER.root);
    expect(got.triad).toBe("min");
    expect(got.seventh).toBe("maj7");
  });

  it("keeps a null slash bass instead of reading it as missing", () => {
    expect(reviveBuilder({ ...DEFAULT_BUILDER, bass: null })!.bass).toBeNull();
    expect(reviveBuilder({ ...DEFAULT_BUILDER, bass: "Q#" })!.bass).toBe(DEFAULT_BUILDER.bass);
  });

  it("drops unknown alterations rather than the whole list", () => {
    const got = reviveBuilder({ ...DEFAULT_BUILDER, alterations: ["b9", "b6", 7] })!;
    expect(got.alterations).toEqual(["b9"]);
  });

  it("survives an alterations field that isn't a list", () => {
    expect(reviveBuilder({ ...DEFAULT_BUILDER, alterations: "#9" })!.alterations).toEqual([]);
  });
});
