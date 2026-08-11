import { describe, expect, it } from "vitest";
import guitarDb from "@tombatossals/chords-db/lib/guitar.json";
import { parseChordSymbol } from "../src/theory/chord";
import { DEFAULT_SEARCH_OPTIONS, computeHand, findVoicings } from "../src/theory/search";
import { parseTuning } from "../src/theory/tuning";

/**
 * Calibration against a curated chord library.
 *
 * The hand model is the most opinionated part of the engine, and it's easy to
 * convince yourself a shape is hard when thousands of players do it daily.
 * @tombatossals/chords-db carries 2,069 human-curated fingerings for standard
 * tuning, complete with finger assignments and barre markings, so we can check
 * our beliefs against it rather than against intuition.
 */

interface DbPosition {
  frets: number[];
  fingers: number[];
  baseFret: number;
  barres?: number[];
}

const positions: DbPosition[] = (() => {
  const out: DbPosition[] = [];
  const chords = (guitarDb as unknown as { chords: Record<string, { positions: DbPosition[] }[]> })
    .chords;
  for (const key of Object.keys(chords)) {
    for (const chord of chords[key]) out.push(...chord.positions);
  }
  return out;
})();

/** DB frets are relative to baseFret; -1 means muted. */
function absoluteFrets(p: DbPosition): (number | null)[] {
  return p.frets.map((f) => (f === -1 ? null : f === 0 ? 0 : p.baseFret > 1 ? f + p.baseFret - 1 : f));
}

function handFor(p: DbPosition) {
  const frets = absoluteFrets(p);
  const fretted = frets
    .map((f, i) => ({ stringIndex: i, fret: f ?? 0, midi: 0, tone: null as never }))
    .filter((n) => (frets[n.stringIndex] ?? 0) > 0);
  return computeHand(frets, fretted);
}

describe("hand model vs a curated chord library", () => {
  it("has a corpus to check against", () => {
    expect(positions.length).toBeGreaterThan(2000);
  });

  it("accepts virtually every shape real players actually use", () => {
    const rejected = positions.filter((p) => handFor(p) === null).length;
    // A handful of curated shapes need split barres or thumb-over technique we
    // deliberately don't model. Anything above a few percent means the model
    // has become too strict and is discarding good voicings.
    expect(rejected / positions.length).toBeLessThan(0.03);
  });

  it("rarely demands more fingers than a human uses", () => {
    let overStrict = 0;
    for (const p of positions) {
      const hand = handFor(p);
      if (!hand) continue;
      const human = new Set(p.fingers.filter((f) => f > 0)).size;
      if (hand.fingers > human) overStrict++;
    }
    expect(overStrict / positions.length).toBeLessThan(0.03);
  });

  it("never grants a barre across a muted string", () => {
    // The barre finger presses every string it lies over, so a muted string
    // inside the span is physically impossible.
    for (const p of positions) {
      const hand = handFor(p);
      if (!hand?.barre) continue;
      const frets = absoluteFrets(p);
      for (let i = hand.barre.from; i <= hand.barre.to; i++) {
        expect(frets[i], JSON.stringify(p.frets)).not.toBeNull();
      }
    }
  });
});

describe("A-shape barres rank well", () => {
  const rankOf = (symbol: string, id: string) => {
    const tuning = parseTuning("EADGBE").tuning!;
    const res = findVoicings(parseChordSymbol(symbol).spec!, tuning, {
      ...DEFAULT_SEARCH_OPTIONS,
      maxResults: 5000,
    });
    return { rank: res.voicings.findIndex((v) => v.id === id) + 1, v: res.voicings.find((x) => x.id === id) };
  };

  it("plays the A-shape B with two fingers, not four", () => {
    const { v } = rankOf("B", "x-2-4-4-4-2");
    expect(v).toBeTruthy();
    // Index barre at 2, ring finger barring the 4-4-4.
    expect(v!.fingers).toBe(2);
  });

  it("puts common barre shapes near the top", () => {
    for (const [symbol, id, limit] of [
      ["B", "x-2-4-4-4-2", 3],
      ["Bb", "x-1-3-3-3-1", 3],
      ["F", "1-3-3-2-1-1", 3],
      // The A-shape minor barre costs four fingers, not three: the 5-5 pair sits
      // one fret above the 4, so the finger covering it has nowhere to lift its
      // tip clear and has to be two fingers. The curated fingering agrees. That
      // is enough to put the 8th-fret E-shape barre ahead of it by three
      // quarters of a point, which is a fair fight rather than a bug.
      ["Cm", "x-3-5-5-4-3", 2],
    ] as const) {
      const { rank } = rankOf(symbol, id);
      expect(rank, `${symbol} ${id} ranked #${rank}`).toBeGreaterThan(0);
      expect(rank, `${symbol} ${id} ranked #${rank}`).toBeLessThanOrEqual(limit);
    }
  });
});

describe("awkwardness, verified on a real guitar", () => {
  const tuning = () => parseTuning("EADGBE").tuning!;
  const shapes = (symbol: string) =>
    findVoicings(parseChordSymbol(symbol).spec!, tuning(), {
      ...DEFAULT_SEARCH_OPTIONS,
      maxResults: 5000,
    }).voicings;

  it("ranks the Cm barre above x31013, which is nastier than it looks", () => {
    // Reported from actually playing it: x31013 puts fret 1 on both sides of
    // the open G and fret 3 four strings apart, so all four fingers are
    // splayed at once. Much harder than the barre despite the finger count.
    const all = shapes("Cm");
    const barre = all.findIndex((v) => v.id === "x-3-5-5-4-3");
    const nasty = all.findIndex((v) => v.id === "x-3-1-0-1-3");
    expect(barre).toBeGreaterThanOrEqual(0);
    expect(nasty).toBeGreaterThanOrEqual(0);
    expect(barre).toBeLessThan(nasty);
  });

  it("leaves interior open strings unpenalised — open C is a first chord", () => {
    // x32010 rings the open G between two fretted strings. Its fingers sit on a
    // natural 3-2-1 diagonal and only have to arch, which costs nothing.
    expect(shapes("C")[0].id).toBe("x-3-2-0-1-0");
  });

  it("still likes the standard open shapes best", () => {
    expect(shapes("E")[0].id).toBe("0-2-2-1-0-0");
    expect(shapes("Am")[0].id).toBe("x-0-2-2-1-0");
    expect(shapes("D")[0].id).toBe("x-x-0-2-3-2");
  });

  /*
   * The first chords anyone learns are all the same shape argument: several
   * strings at one fret with an open string just past them. Barring them would
   * kill the open string, so nobody bars them — they cost a finger a string and
   * are still the easiest shapes on the instrument. The model used to hand out
   * the barre anyway and then charge four points for the damage, which buried
   * open A at rank 251 and open Em below three shapes nobody plays.
   */
  it("plays the shapes with an open string past the fingers, and likes them best", () => {
    for (const [symbol, id, fingers] of [
      ["A", "x-0-2-2-2-0", 3],
      ["Em", "0-2-2-0-0-0", 2],
    ] as const) {
      const top = shapes(symbol)[0];
      expect(top.id, symbol).toBe(id);
      // A finger per string, because the bar would land on the open string
      // just past it. Nobody bars these and neither does the model.
      expect(top.fingers, symbol).toBe(fingers);
      expect(top.flags.filter((f) => f.kind === "warn"), symbol).toEqual([]);
    }
  });

  it("finds the obvious open D in DAEGAD", () => {
    const res = findVoicings(parseChordSymbol("D").spec!, parseTuning("DAEGAD").tuning!, {
      ...DEFAULT_SEARCH_OPTIONS,
      maxResults: 5000,
    });
    expect(res.voicings[0].id).toBe("0-0-2-2-0-0");
  });

  const hand = (shape: string) => {
    const frets = [...shape].map((c) => (c === "x" ? null : Number(c)));
    const fretted = frets
      .map((f, i) => ({ stringIndex: i, fret: f ?? 0, midi: 0, tone: null as never }))
      .filter((n) => (frets[n.stringIndex] ?? 0) > 0);
    return computeHand(frets, fretted);
  };

  /*
   * How wide a bar may be and still lift its tip over the string past it. The
   * curated library has 52 two-string bars and 6 three-string bars that overhang
   * a lower-fretted string, and no four-string ones at all: by then the finger
   * is at full stretch and the tip has nothing left to lift with.
   */
  it("won't overhang a string with a bar that has no finger left to spare", () => {
    // Two strings, one fret below, tip lifted over it: the most common
    // overhanging bar there is (31 of them in the library).
    expect(hand("332333")?.fingers).toBe(3);
    // Three strings, and the whole reason A-shape barres work.
    expect(hand("x24442")?.fingers).toBe(2);
    // Four strings at the 3rd fret with the high E at the 2nd: no lift left, so
    // it is a finger per string and a fifth on the high E.
    expect(hand("x33332")).toBeNull();
    // A bar reaches one string past itself and no further, which is what makes
    // the E-shape minor barre two fingers: the ring bar on the A and D strings
    // has ended long before the B string, whatever is fretted there.
    const eShapeMinor = computeHand(
      [8, 10, 10, 8, 8, 8],
      [8, 10, 10, 8, 8, 8].map((fret, stringIndex) => ({
        stringIndex,
        fret,
        midi: 0,
        tone: null as never,
      })),
    );
    expect(eShapeMinor?.fingers).toBe(2);
  });

  it("uses fingertips either side of a ringing open string", () => {
    // Four fingertips around an open string are fine — everyone's fingers are
    // arched. These used to be flagged as physically impossible.
    expect(hand("220120")?.fingers).toBe(4);
    expect(hand("011010")?.fingers).toBe(3);
  });
});

describe("muting is priced by how hard it is", () => {
  const tuning = () => parseTuning("EADGBE").tuning!;
  const find = (symbol: string, id: string) =>
    findVoicings(parseChordSymbol(symbol).spec!, tuning(), {
      ...DEFAULT_SEARCH_OPTIONS,
      maxResults: 5000,
      // These comparisons are between two shapes that differ only by a mute,
      // which is exactly the pair the search collapses for display.
      collapseMuteVariants: false,
      // A mute above the highest sounding string is a skipped string, so half
      // of each pair below exists only with that permission granted.
      allowInnerMutes: true,
    }).voicings.find((v) => v.id === id);

  it("prefers muting the low side to muting the high side", () => {
    // Same four notes of an A minor triad, once with the low string dropped and
    // once with the high one dropped.
    const lowMuted = find("Am", "x-0-2-2-1-0");
    const highMuted = find("Am", "x-0-2-2-1-x");
    expect(lowMuted).toBeTruthy();
    expect(highMuted).toBeTruthy();
    expect(lowMuted!.score).toBeLessThan(highMuted!.score);
  });

  it("won't silence a string above the bass without being asked", () => {
    // Killing the top string and skipping one in the middle take the same
    // deliberate technique, so they take the same permission. Dropping the
    // bottom string or two is the only muting that needs none.
    const strummed = (symbol: string) =>
      findVoicings(parseChordSymbol(symbol).spec!, tuning(), {
        ...DEFAULT_SEARCH_OPTIONS,
        maxResults: 5000,
        collapseMuteVariants: false,
      }).voicings.map((v) => v.id);

    expect(strummed("Am")).not.toContain("x-0-2-2-1-x");
    expect(strummed("Am")).toContain("x-0-2-2-1-0");
    expect(find("Am", "x-0-2-2-1-x")).toBeTruthy();
  });

  it("would rather drop the bottom string than invert the chord", () => {
    // 0-3-2-0-1-0 is a C/E, which is a different chord under a progression. The
    // low-side mute that gets the root back underneath costs 0.4; the inversion
    // has to cost more than that.
    const rooted = find("C", "x-3-2-0-1-0");
    const inverted = find("C", "0-3-2-0-1-0");
    expect(rooted).toBeTruthy();
    expect(inverted).toBeTruthy();
    expect(rooted!.score).toBeLessThan(inverted!.score);
  });

  it("won't stretch for a note the string next door is already sounding", () => {
    // In DAEGAD the 7th fret of the low D string is the A the open A string is
    // already playing. Filling the bottom string looks like a free win, and it
    // used to be one — but the unison adds nothing and costs a finger.
    const daegad = parseTuning("DAEGAD").tuning!;
    const res = findVoicings(parseChordSymbol("A").spec!, daegad, {
      ...DEFAULT_SEARCH_OPTIONS,
      maxResults: 5000,
    }).voicings;
    const doubled = res.findIndex((v) => v.id === "7-0-0-6-0-7");
    const plain = res.findIndex((v) => v.id === "x-0-0-6-0-7");
    expect(plain).toBeGreaterThanOrEqual(0);
    expect(doubled).toBeGreaterThan(plain);
  });
});
