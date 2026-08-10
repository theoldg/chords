import type { ChordSpec, Tone } from "./chord";
import { analyseTones, violatesLowIntervalLimit, type RuleOptions, type ToneRule } from "./rules";
import type { Tuning } from "./tuning";
import { midiToPitchClass } from "./tuning";

export interface SearchOptions extends RuleOptions {
  maxFret: number;
  /** Maximum number of frets the hand spans, ignoring open strings. */
  maxSpan: number;
  minSoundingStrings: number;
  /** Allow a muted string sandwiched between sounding ones. */
  allowInnerMutes: boolean;
  maxResults: number;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  maxFret: 14,
  maxSpan: 4,
  minSoundingStrings: 4,
  allowInnerMutes: false,
  allowRootOmission: false,
  maxResults: 36,
};

export interface VoicingNote {
  stringIndex: number;
  fret: number;
  midi: number;
  tone: Tone;
}

export interface Flag {
  kind: "info" | "warn";
  text: string;
}

export interface Voicing {
  /** Per string, low -> high. null = muted. */
  frets: (number | null)[];
  notes: VoicingNote[];
  omitted: { tone: Tone; label: string }[];
  flags: Flag[];
  fingers: number;
  barre: { fret: number; from: number; to: number } | null;
  lowestFret: number;
  span: number;
  score: number;
  bassTone: Tone | null;
  topTone: Tone | null;
  /** Stable key for React. */
  id: string;
}

export interface SearchResult {
  voicings: Voicing[];
  rules: ToneRule[];
  /** Set when nothing was found, explaining what to relax. */
  emptyHint: string | null;
}

export function findVoicings(
  spec: ChordSpec,
  tuning: Tuning,
  opts: SearchOptions,
): SearchResult {
  const rules = analyseTones(spec, opts);
  const toneByChroma = new Map<number, Tone>();
  for (const t of spec.tones) {
    const chroma = (spec.rootChroma + t.semitones) % 12;
    // If two tones collide on the same pitch class, keep the more specific one
    // (an altered tone beats a plain one).
    const existing = toneByChroma.get(chroma);
    if (!existing || (t.altered && !existing.altered)) toneByChroma.set(chroma, t);
  }

  const strings = tuning.strings;
  // Candidate frets per string, plus `null` for muted.
  const candidates: (number | null)[][] = strings.map((s) => {
    const out: (number | null)[] = [null];
    for (let fret = 0; fret <= opts.maxFret; fret++) {
      if (toneByChroma.has(midiToPitchClass(s.midi + fret))) out.push(fret);
    }
    return out;
  });

  const results: Voicing[] = [];
  const current: (number | null)[] = new Array(strings.length).fill(null);

  const walk = (index: number, minFret: number, maxFret: number) => {
    if (results.length > 20000) return; // hard safety valve
    if (index === strings.length) {
      const v = evaluate(current.slice(), spec, strings, toneByChroma, rules, opts);
      if (v) results.push(v);
      return;
    }
    for (const fret of candidates[index]) {
      let nextMin = minFret;
      let nextMax = maxFret;
      if (fret !== null && fret > 0) {
        nextMin = Math.min(minFret, fret);
        nextMax = Math.max(maxFret, fret);
        if (nextMax - nextMin + 1 > opts.maxSpan) continue;
      }
      current[index] = fret;
      walk(index + 1, nextMin, nextMax);
      current[index] = null;
    }
  };

  walk(0, Infinity, -Infinity);

  results.sort((a, b) => a.score - b.score);
  const trimmed = results.slice(0, opts.maxResults);

  return {
    voicings: trimmed,
    rules,
    emptyHint: results.length ? null : buildEmptyHint(spec, opts),
  };
}

function buildEmptyHint(spec: ChordSpec, opts: SearchOptions): string {
  const bits: string[] = [];
  if (opts.maxSpan < 5) bits.push("widen the fret stretch");
  if (!opts.allowRootOmission) bits.push("allow dropping the root");
  if (opts.minSoundingStrings > 3) bits.push("lower the minimum number of strings");
  if (!opts.allowInnerMutes) bits.push("allow skipped strings");
  const tail = bits.length ? ` Try: ${bits.join(", ")}.` : "";
  return `No playable shape for ${spec.symbol} in this tuning under the current constraints.${tail}`;
}

function evaluate(
  frets: (number | null)[],
  spec: ChordSpec,
  strings: Tuning["strings"],
  toneByChroma: Map<number, Tone>,
  rules: ToneRule[],
  opts: SearchOptions,
): Voicing | null {
  const notes: VoicingNote[] = [];
  for (let i = 0; i < frets.length; i++) {
    const fret = frets[i];
    if (fret === null) continue;
    const midi = strings[i].midi + fret;
    const tone = toneByChroma.get(midiToPitchClass(midi));
    if (!tone) return null;
    notes.push({ stringIndex: i, fret, midi, tone });
  }

  if (notes.length < opts.minSoundingStrings) return null;

  // Inner mutes: a muted string between two sounding ones needs deliberate
  // muting technique, so it's opt-in.
  const firstSounding = notes[0].stringIndex;
  const lastSounding = notes[notes.length - 1].stringIndex;
  let innerMutes = 0;
  for (let i = firstSounding; i <= lastSounding; i++) {
    if (frets[i] === null) innerMutes++;
  }
  if (innerMutes > 0 && !opts.allowInnerMutes) return null;

  // Required tones present?
  const presentDegrees = new Set(notes.map((n) => n.tone.degree));
  const omitted: { tone: Tone; label: string }[] = [];
  let omissionCost = 0;
  for (const rule of rules) {
    if (presentDegrees.has(rule.tone.degree)) continue;
    if (rule.required) return null;
    omitted.push({ tone: rule.tone, label: rule.tone.label });
    omissionCost += rule.omissionCost;
  }

  // Hand shape.
  const fretted = notes.filter((n) => n.fret > 0);
  const hand = computeHand(frets, fretted);
  if (hand === null) return null; // needs more than four fingers

  const flags: Flag[] = [];
  let score = 0;

  score += omissionCost;
  score += hand.fingers * 1.2;
  if (hand.barre) score += 1.4;
  score += Math.max(0, hand.span - 1) * 1.5;
  score -= notes.filter((n) => n.fret === 0).length * 0.6;

  // Prefer shapes near the nut. Cheap to reach, easier to hold, and they get
  // to use open strings. Scaled so a shape twelve frets up pays about four
  // points — enough to lose to its open-position equivalent, not so much that
  // it outweighs dropping a required-ish tone.
  score += hand.lowestFret * 0.35;

  // Prefer voicings that ring out across the whole instrument: every silent
  // string is a cost, and using all of them earns an extra bonus on top.
  const silentStrings = strings.length - notes.length;
  score += silentStrings * 1.6;
  if (silentStrings === 0) {
    score -= 1.5;
    flags.push({ kind: "info", text: "All strings" });
  }
  if (innerMutes > 0) {
    score += 4 * innerMutes;
    flags.push({ kind: "warn", text: `Skips ${innerMutes} inner string${innerMutes > 1 ? "s" : ""}` });
  }

  // Bass note quality.
  const bassTone = notes[0].tone;
  if (spec.bassChroma !== null) {
    const wantedBass = midiToPitchClass(notes[0].midi) === spec.bassChroma;
    if (!wantedBass) score += 5;
  } else {
    if (bassTone.role === "root") score -= 2.5;
    else if (bassTone.role === "fifth") score += 0.5;
    else if (bassTone.role === "third") score += 1.2;
    else score += 2.5;
  }
  if (bassTone.role !== "root" && spec.bassChroma === null) {
    flags.push({ kind: "info", text: `${bassTone.label} in the bass` });
  }

  // Top note: landing the named extension on top is what makes it audible.
  const topTone = notes[notes.length - 1].tone;
  if (topTone.role === "extension") score -= 1.8;

  // Voice-leading sanity between adjacent sounding strings.
  let muddy = 0;
  let harsh = 0;
  for (let i = 1; i < notes.length; i++) {
    const lower = notes[i - 1];
    const upper = notes[i];
    if (violatesLowIntervalLimit(lower.midi, upper.midi)) muddy++;
    // A minor 9th between voices is harsh, except root -> b9 in a dominant,
    // where it is precisely the intended sound.
    if (upper.midi - lower.midi === 13) {
      const intended =
        lower.tone.role === "root" && upper.tone.degree === 9 && upper.tone.alter === -1;
      if (!intended) harsh++;
    }
  }
  if (muddy) {
    score += muddy * 2.5;
    flags.push({ kind: "warn", text: "Muddy in the low end" });
  }
  if (harsh) {
    score += harsh * 3;
    flags.push({ kind: "warn", text: "Harsh b9 clash between voices" });
  }

  // Doubling an extension or a 7th is usually worse than doubling root/5th.
  const degreeCounts = new Map<number, number>();
  for (const n of notes) degreeCounts.set(n.tone.degree, (degreeCounts.get(n.tone.degree) ?? 0) + 1);
  for (const [degree, count] of degreeCounts) {
    if (count > 1) {
      // Doubling the root or 5th is harmless; doubling colour tones muddies the
      // chord. The small base cost breaks ties toward the simpler shape.
      score += (count - 1) * (degree === 1 || degree === 5 ? 0.4 : 1.2);
    }
  }

  if (hand.barre) flags.push({ kind: "info", text: `Barre at fret ${hand.barre.fret}` });
  if (hand.fingers === 0) flags.push({ kind: "info", text: "Open shape" });

  return {
    frets,
    notes,
    omitted,
    flags,
    fingers: hand.fingers,
    barre: hand.barre,
    lowestFret: hand.lowestFret,
    span: hand.span,
    score,
    bassTone,
    topTone,
    id: frets.map((f) => (f === null ? "x" : f)).join("-"),
  };
}

function computeHand(
  frets: (number | null)[],
  fretted: VoicingNote[],
): { fingers: number; barre: { fret: number; from: number; to: number } | null; span: number; lowestFret: number } | null {
  if (!fretted.length) {
    return { fingers: 0, barre: null, span: 0, lowestFret: 0 };
  }
  const fretNumbers = fretted.map((n) => n.fret);
  const lowestFret = Math.min(...fretNumbers);
  const highestFret = Math.max(...fretNumbers);
  const span = highestFret - lowestFret + 1;

  // Can we barre the lowest fret? Only if at least two strings sit on it and
  // nothing inside the barre span is played open (you can't sound an open
  // string underneath a barre).
  const atLowest = fretted.filter((n) => n.fret === lowestFret);
  let barre: { fret: number; from: number; to: number } | null = null;
  if (atLowest.length >= 2) {
    const from = atLowest[0].stringIndex;
    const to = atLowest[atLowest.length - 1].stringIndex;
    let usable = true;
    for (let i = from; i <= to; i++) {
      const f = frets[i];
      if (f !== null && f < lowestFret) usable = false; // includes open strings
    }
    if (usable) barre = { fret: lowestFret, from, to };
  }

  const fingers = barre
    ? 1 + fretted.filter((n) => n.fret > lowestFret).length
    : fretted.length;

  if (fingers > 4) return null;
  return { fingers, barre, span, lowestFret };
}
