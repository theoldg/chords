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
      ["Cm", "x-3-5-5-4-3", 1],
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
});

describe("muting is priced by how hard it is", () => {
  const tuning = () => parseTuning("EADGBE").tuning!;
  const find = (symbol: string, id: string) =>
    findVoicings(parseChordSymbol(symbol).spec!, tuning(), {
      ...DEFAULT_SEARCH_OPTIONS,
      maxResults: 5000,
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
});
