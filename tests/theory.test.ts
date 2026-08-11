import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUILDER,
  buildChord,
  parseChordSymbol,
  parseProgression,
} from "../src/theory/chord";
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
    const built = buildChord({ ...DEFAULT_BUILDER, root: "G", triad: "min", ext11: "add" });
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

describe("progression parsing", () => {
  it("splits on spaces, commas, bar lines and newlines", () => {
    const entries = parseProgression("Am7 D7, Gmaj7 | Cmaj7\nF#m7b5");
    expect(entries.map((e) => e.text)).toEqual(["Am7", "D7", "Gmaj7", "Cmaj7", "F#m7b5"]);
    expect(entries.every((e) => e.spec !== null)).toBe(true);
  });

  it("keeps going past a chord it can't read, and says which one", () => {
    const entries = parseProgression("Am7 Xyz9 Gmaj7");
    expect(entries).toHaveLength(3);
    expect(entries[1].spec).toBeNull();
    expect(entries[1].error).toBeTruthy();
    expect(entries[2].spec).toBeTruthy();
  });

  it("ignores stray separators rather than emitting blank rows", () => {
    expect(parseProgression("  Am7 |  | - \n\n D7  ").map((e) => e.text)).toEqual(["Am7", "D7"]);
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

  it("does not rank a barre that lies over an open string it needs", () => {
    // 1-3-2-2-1-0 asks for an index barre at the 1st fret and an open high E
    // the barre is already pressing. The full-barre Fmaj7 must beat it.
    const res = search("Fmaj7", "EADGBE");
    const full = res.voicings.find((v) => v.id === "1-3-2-2-1-1");
    const impossible = res.voicings.find((v) => v.id === "1-3-2-2-1-0");
    expect(full, "full Fmaj7 barre").toBeTruthy();
    expect(res.voicings[0].id).toBe("1-3-2-2-1-1");
    if (impossible) expect(impossible.score).toBeGreaterThan(full!.score + 6);
  });

  it("finds the Hendrix E7#9 and reports that it drops the 5th", () => {
    // Ranked low on purpose — it lives at the 7th fret and we prefer low
    // positions — so search the whole space. What matters here is that the
    // engine finds it at all and reports the omission correctly. Mute variants
    // stay expanded because display prefers the same grip with the low E left
    // ringing, and this test is about the classic muted-low form.
    const res = search("E7#9", "EADGBE", {
      minSoundingStrings: 4,
      maxResults: 100000,
      collapseMuteVariants: false,
    });
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

  it("ranks a full-width voicing above the same shape with a string muted", () => {
    // Both members of the pair, since display keeps only the winner.
    const res = search("Em", "EADGBE", { maxResults: 500, collapseMuteVariants: false });
    const full = res.voicings.find((v) => v.id === "0-2-2-0-0-0");
    const muted = res.voicings.find((v) => v.id === "x-2-2-0-0-0");
    expect(full, "full six-string Em").toBeTruthy();
    expect(muted, "same shape, low E muted").toBeTruthy();
    expect(full!.score).toBeLessThan(muted!.score);
  });

  it("puts shapes using every string near the top", () => {
    const res = search("G", "EADGBE", { maxResults: 12 });
    const usesAll = res.voicings
      .slice(0, 4)
      .some((v) => v.notes.length === 6);
    expect(usesAll).toBe(true);
  });

  it("prefers a shape near the nut to the same shape an octave up", () => {
    const res = search("Am", "EADGBE", { maxFret: 16, maxResults: 2000 });
    const open = res.voicings.find((v) => v.id === "x-0-2-2-1-0");
    const high = res.voicings.find((v) => v.id === "x-12-14-14-13-12");
    expect(open, "open A minor").toBeTruthy();
    expect(high, "same shape at the 12th").toBeTruthy();
    expect(open!.score).toBeLessThan(high!.score);
  });

  it("ranks the lowest position first for a chord playable open", () => {
    const best = search("Am", "EADGBE", { maxFret: 16 }).voicings[0];
    expect(best.lowestFret).toBeLessThanOrEqual(2);
  });

  it("explains itself when nothing fits", () => {
    // Open strings only: EADGBE has no Bb, so the required b7 of C13 is
    // unreachable and there is genuinely nothing to find.
    const res = search("C13", "EADGBE", { maxFret: 0 });
    expect(res.voicings).toHaveLength(0);
    expect(res.emptyHint).toMatch(/Try:/);
  });
});
