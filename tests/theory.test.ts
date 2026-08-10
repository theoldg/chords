import { describe, expect, it } from "vitest";
import { DEFAULT_BUILDER, buildChord, parseChordSymbol } from "../src/theory/chord";
import { analyseTones } from "../src/theory/rules";
import { DEFAULT_SEARCH_OPTIONS, findVoicings } from "../src/theory/search";
import { parseTuning } from "../src/theory/tuning";

const tuning = (s: string) => {
  const r = parseTuning(s);
  if (!r.tuning) throw new Error(r.error ?? "bad tuning");
  return r.tuning;
};

describe("tuning parser", () => {
  it("reads standard tuning at the right octaves", () => {
    expect(tuning("EADGBE").strings.map((s) => s.name)).toEqual([
      "E2",
      "A2",
      "D3",
      "G3",
      "B3",
      "E4",
    ]);
  });

  it("reads DADGAD", () => {
    expect(tuning("DADGAD").strings.map((s) => s.name)).toEqual([
      "D2",
      "A2",
      "D3",
      "G3",
      "A3",
      "D4",
    ]);
  });

  it("treats lowercase b as a flat, not a B string", () => {
    expect(tuning("EbAbDbGbBbEb").strings).toHaveLength(6);
  });

  it("honours explicit octaves", () => {
    expect(tuning("G4C4E4A4").strings.map((s) => s.name)).toEqual(["G4", "C4", "E4", "A4"]);
  });

  it("rejects nonsense", () => {
    expect(parseTuning("HXQ").error).toBeTruthy();
  });
});

describe("chord parsing", () => {
  it("handles add11, which tonal alone cannot", () => {
    const { spec } = parseChordSymbol("Gm(add11)");
    expect(spec).toBeTruthy();
    expect(spec!.tones.map((t) => t.label)).toEqual(["R", "b3", "5", "11"]);
    expect(spec!.tones.map((t) => t.noteName)).toEqual(["G", "Bb", "D", "C"]);
  });

  it("parses the same chord written several ways", () => {
    for (const s of ["Gmadd11", "Gm(add11)", "Gmin(add11)", "G-add11"]) {
      const { spec } = parseChordSymbol(s);
      expect(spec, s).toBeTruthy();
      expect(spec!.tones.map((t) => t.label), s).toEqual(["R", "b3", "5", "11"]);
    }
  });

  it("spells notes within the chord, not as sharps", () => {
    const { spec } = parseChordSymbol("Eb7");
    expect(spec!.tones.map((t) => t.noteName)).toEqual(["Eb", "G", "Bb", "Db"]);
  });

  it("keeps 6/9 rather than reading /9 as a slash bass", () => {
    const { spec } = parseChordSymbol("C6/9");
    expect(spec!.bassName).toBeNull();
    expect(spec!.tones.map((t) => t.label)).toContain("6");
    expect(spec!.tones.map((t) => t.label)).toContain("9");
  });

  it("does read a real slash bass", () => {
    const { spec } = parseChordSymbol("Am7/E");
    expect(spec!.bassName).toBe("E");
  });

  it("flags the natural 11 against a major third", () => {
    const { spec } = parseChordSymbol("Cadd11");
    expect(spec!.warnings.join(" ")).toMatch(/clash/i);
  });

  it("rejects gibberish", () => {
    expect(parseChordSymbol("Hqq7").error).toBeTruthy();
  });
});

describe("block builder", () => {
  it("builds Gm(add11) from blocks and matches the typed form", () => {
    const built = buildChord(DEFAULT_BUILDER);
    expect(built.symbol).toBe("Gm(add11)");
    const typed = parseChordSymbol("Gm(add11)").spec!;
    expect(built.tones.map((t) => t.label)).toEqual(typed.tones.map((t) => t.label));
  });

  it("names a stacked dominant 13 correctly", () => {
    const spec = buildChord({
      ...DEFAULT_BUILDER,
      root: "C",
      triad: "maj",
      seventh: "b7",
      ext9: "on",
      ext11: "off",
      ext13: "on",
    });
    expect(spec.symbol).toBe("C13");
  });

  it("builds m7b5 as a half-diminished chord", () => {
    const spec = buildChord({
      ...DEFAULT_BUILDER,
      root: "B",
      triad: "dim",
      seventh: "b7",
      ext11: "off",
    });
    expect(spec.tones.map((t) => t.label)).toEqual(["R", "b3", "b5", "b7"]);
  });
});

describe("omission rules", () => {
  const rulesFor = (symbol: string, allowRootOmission = false) =>
    analyseTones(parseChordSymbol(symbol).spec!, { allowRootOmission });

  const status = (symbol: string, label: string, allowRoot = false) => {
    const r = rulesFor(symbol, allowRoot).find((x) => x.tone.label === label);
    if (!r) throw new Error(`no tone ${label} in ${symbol}`);
    return r.required ? "required" : "optional";
  };

  it("lets a 9 chord drop the perfect 5th", () => {
    expect(status("C9", "5")).toBe("optional");
  });

  it("never drops the 3rd or the 7th", () => {
    expect(status("C9", "3")).toBe("required");
    expect(status("C9", "b7")).toBe("required");
  });

  it("never drops an altered 5th, because it is the point of the chord", () => {
    expect(status("Bm7b5", "b5")).toBe("required");
    expect(status("Caug", "#5")).toBe("required");
  });

  it("keeps every tone of a diminished 7th", () => {
    for (const r of rulesFor("Cdim7")) expect(r.required, r.tone.label).toBe(true);
  });

  it("requires the extension the chord is named for", () => {
    expect(status("Gm(add11)", "11")).toBe("required");
    expect(status("C13", "13")).toBe("required");
  });

  it("treats the 9 under a 13 as filler", () => {
    expect(status("C13", "9")).toBe("optional");
  });

  it("only allows a rootless voicing when a bassist is covering it", () => {
    expect(status("C9", "R")).toBe("required");
    expect(status("C9", "R", true)).toBe("optional");
  });
});

describe("voicing search", () => {
  const search = (symbol: string, tune: string, over = {}) =>
    findVoicings(parseChordSymbol(symbol).spec!, tuning(tune), {
      ...DEFAULT_SEARCH_OPTIONS,
      ...over,
    });

  it("finds the open C major shape in standard tuning", () => {
    const shapes = search("C", "EADGBE").voicings.map((v) => v.id);
    expect(shapes).toContain("x-3-2-0-1-0");
  });

  it("finds the E-shape F barre", () => {
    const shapes = search("F", "EADGBE").voicings.map((v) => v.id);
    expect(shapes).toContain("1-3-3-2-1-1");
  });

  it("finds the Hendrix E7#9 and reports that it drops the 5th", () => {
    const res = search("E7#9", "EADGBE", { minSoundingStrings: 4, maxResults: 200 });
    const hendrix = res.voicings.find((v) => v.id === "x-7-6-7-8-x");
    expect(hendrix).toBeTruthy();
    expect(hendrix!.omitted.map((o) => o.label)).toEqual(["5"]);
  });

  it("never emits a shape missing a required tone", () => {
    const res = search("C13", "EADGBE", { allowRootOmission: true });
    expect(res.voicings.length).toBeGreaterThan(0);
    for (const v of res.voicings) {
      const degrees = new Set(v.notes.map((n) => n.tone.degree));
      expect(degrees.has(3), v.id).toBe(true);
      expect(degrees.has(7), v.id).toBe(true);
      expect(degrees.has(13), v.id).toBe(true);
    }
  });

  it("never emits a shape needing more than four fingers", () => {
    for (const v of search("Gm(add11)", "DAEGAD").voicings) {
      expect(v.fingers).toBeLessThanOrEqual(4);
    }
  });

  it("respects the fret-span limit", () => {
    for (const v of search("Cmaj9", "EADGBE", { maxSpan: 3 }).voicings) {
      expect(v.span).toBeLessThanOrEqual(3);
    }
  });

  it("solves the original brief: Gm(add11) in DAEGAD", () => {
    const res = search("Gm(add11)", "DAEGAD");
    expect(res.voicings.length).toBeGreaterThan(0);
    for (const v of res.voicings) {
      const labels = new Set(v.notes.map((n) => n.tone.label));
      expect(labels.has("b3"), v.id).toBe(true);
      expect(labels.has("11"), v.id).toBe(true);
    }
  });

  it("explains itself when nothing fits", () => {
    // Open strings only: EADGBE has no Bb, so the required b7 of C13 is
    // unreachable and there is genuinely nothing to find.
    const res = search("C13", "EADGBE", { maxFret: 0 });
    expect(res.voicings).toHaveLength(0);
    expect(res.emptyHint).toMatch(/Try:/);
  });
});
