import type { ChordSpec, Tone } from "./chord";
import { analyseTones, violatesLowIntervalLimit, type RuleOptions, type ToneRule } from "./rules";
import type { Tuning } from "./tuning";
import { midiToPitchClass } from "./tuning";

export interface SearchOptions extends RuleOptions {
  maxFret: number;
  /** Maximum number of frets the hand spans, ignoring open strings. */
  maxSpan: number;
  minSoundingStrings: number;
  /**
   * Allow a string to be skipped anywhere other than below the bass: between
   * two sounding strings, or above the highest one. Both need the same
   * deliberate muting technique, so they are the same permission — dropping
   * the bottom string or two is what nobody needs permission for.
   */
  allowInnerMutes: boolean;
  /**
   * Collapse shapes that share their fretted notes and differ only in which
   * strings ring open and which stay silent, keeping the best-scoring one.
   * Off lets a caller inspect both members of such a pair — which is how the
   * mute-pricing model is tested.
   */
  collapseMuteVariants: boolean;
  maxResults: number;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  maxFret: 14,
  maxSpan: 4,
  minSoundingStrings: 4,
  allowInnerMutes: false,
  collapseMuteVariants: true,
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

  /*
   * A slash bass outside the chord (Am/G#) is a pitch class the harmony never
   * contains, so it has to be admitted as a candidate fret in its own right —
   * otherwise the search can only ever offer shapes with the wrong bass. Where
   * it is allowed to sound is evaluate()'s business: lowest string, once.
   */
  const addedBassChroma = spec.addedBass !== null ? spec.bassChroma : null;

  const strings = tuning.strings;
  // Candidate frets per string, plus `null` for muted.
  const candidates: (number | null)[][] = strings.map((s) => {
    const out: (number | null)[] = [null];
    for (let fret = 0; fret <= opts.maxFret; fret++) {
      const chroma = midiToPitchClass(s.midi + fret);
      if (toneByChroma.has(chroma) || chroma === addedBassChroma) out.push(fret);
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

  /*
   * Shapes that share their fretted notes and differ only in which of the
   * remaining strings ring open and which stay silent are one grip, not
   * several: the left hand does nothing different, and the list was showing
   * Am7 as x-0-2-0-1-0, then 0-0-2-0-1-0, then x-0-2-0-1-x — the same chord
   * three times, crowding out genuinely different voicings.
   *
   * Keep the best-scoring member of each grip. Everything that distinguishes
   * them — the open-string bonus, where the mute sits, the bass note, whether
   * the shape rings across the whole instrument — is already priced, so the
   * survivor of a sorted list is the one actually worth playing.
   */
  const seen = new Set<string>();
  const deduped = !opts.collapseMuteVariants
    ? results
    : results.filter((v) => {
        const grip = v.frets.map((f, i) => (f !== null && f > 0 ? `${i}:${f}` : "")).join(",");
        if (seen.has(grip)) return false;
        seen.add(grip);
        return true;
      });

  const trimmed = deduped.slice(0, opts.maxResults);

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
  const bass =
    spec.addedBass !== null
      ? ` Every shape has to put ${spec.addedBass.noteName} on the lowest sounding string, since it isn't a tone of the chord.`
      : "";
  return `No playable shape for ${spec.symbol} in this tuning under the current constraints.${bass}${tail}`;
}

function evaluate(
  frets: (number | null)[],
  spec: ChordSpec,
  strings: Tuning["strings"],
  toneByChroma: Map<number, Tone>,
  rules: ToneRule[],
  opts: SearchOptions,
): Voicing | null {
  const addedBass = spec.addedBass;
  const addedBassChroma = addedBass !== null ? spec.bassChroma : null;

  const notes: VoicingNote[] = [];
  for (let i = 0; i < frets.length; i++) {
    const fret = frets[i];
    if (fret === null) continue;
    const midi = strings[i].midi + fret;
    const chroma = midiToPitchClass(midi);
    const tone =
      chroma === addedBassChroma && addedBass !== null ? addedBass : toneByChroma.get(chroma);
    if (!tone) return null;
    notes.push({ stringIndex: i, fret, midi, tone });
  }

  if (notes.length < opts.minSoundingStrings) return null;

  /*
   * A bass note from outside the chord only works as a bass note. Am/G# with
   * the G# in the middle of the voicing is Ammaj7, and doubled an octave up it
   * is a semitone clash against the root — so it sounds on the lowest string
   * and nowhere else, and a shape that hasn't got it isn't the chord asked for.
   */
  if (addedBass !== null) {
    if (notes[0].tone !== addedBass) return null;
    if (notes.some((n, i) => i > 0 && n.tone === addedBass)) return null;
  }

  /*
   * Silencing a string is not equally easy everywhere. Dropping the bottom of
   * the instrument is routine — the fretting thumb or the picking hand damps
   * it, and you simply start the strum lower down — and it accounts for 54.4%
   * of the muted strings in the 2,069 curated shapes of
   * @tombatossals/chords-db.
   *
   * Everywhere else it is the same act: nothing is resting on that string, so
   * you have to put something there on purpose. Whether the silent string sits
   * between two sounding ones or above the highest one makes no difference to
   * the hand, so the two are priced the same and gated by the same permission —
   * which is really the switch between strumming and picking the chord.
   */
  const firstSounding = notes[0].stringIndex;
  let skippedMutes = 0;
  let lowSideMutes = 0;
  for (let i = 0; i < frets.length; i++) {
    if (frets[i] !== null) continue;
    if (i < firstSounding) lowSideMutes++;
    else skippedMutes++;
  }
  if (skippedMutes > 0 && !opts.allowInnerMutes) return null;

  // Required tones present? The added bass doesn't count towards them — its
  // degree can collide with a real one (Am7/G# is a natural 7 under a b7) and
  // it would otherwise satisfy a rule for a note nobody is playing.
  const presentDegrees = new Set(
    notes.filter((n) => n.tone.role !== "bass").map((n) => n.tone.degree),
  );
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
  if (hand.barre) score += 0.4;

  /*
   * Raw fret span is the wrong thing to charge once there is a barre. The
   * barre finger is an anchor: it holds its fret flat without stretching, and
   * the remaining fingers work forward from it, so a barre plus fingers a
   * couple of frets up is not a stretch at all — it is every E- and A-shape
   * barre chord there is. Charging span-1 taxed Am7 as 5-7-5-5-5-5 three
   * points for a shape whose only reach is one finger, one fret past the
   * barre, and did the same to every barre form in the library. Span 3 is in
   * fact the *modal* barre shape in the curated library (699 of 1,218).
   *
   * One fret of relief, not two: zeroing it outright let the A-shape C barre
   * x-3-5-5-5-3 undercut open C, and no model that says that is calibrated.
   */
  const stretch = hand.barre ? Math.max(0, hand.span - 2) : Math.max(0, hand.span - 1);
  score += stretch * 1.5;

  score -= notes.filter((n) => n.fret === 0).length * 0.6;

  score += handAwkwardness(hand.placements);

  /*
   * A note doubled at the same pitch on two strings adds nothing but a finger.
   * It is not the same as doubling at the octave, which thickens the chord: two
   * strings on the identical note just sound like one slightly wider string. In
   * DAEGAD the search was offering 7-0-0-6-0-7 over x-0-0-6-0-7 — a stretch to
   * the 7th fret to sound an A that the open A string beside it is already
   * sounding — because filling the bottom string looked like a free win.
   */
  const unisons = notes.length - new Set(notes.map((n) => n.midi)).size;
  score += unisons * 0.9;

  // Prefer shapes near the nut. Cheap to reach, easier to hold, and they get
  // to use open strings. Scaled so a shape twelve frets up pays about four
  // points — enough to lose to its open-position equivalent, not so much that
  // it outweighs dropping a required-ish tone.
  score += hand.lowestFret * 0.65;

  /*
   * Prefer voicings that ring out across the whole instrument, but price each
   * silent string by how hard it actually is to silence (see above). Dropping
   * one or two bass strings is free enough to be worth doing for a better bass
   * note; past that you are throwing away the instrument, so the third one
   * costs what a skipped string costs.
   */
  score += lowSideMutes * 0.4 + Math.max(0, lowSideMutes - 2) * 2.6 + skippedMutes * 3;
  if (lowSideMutes + skippedMutes === 0) {
    score -= 1.2;
  }

  /*
   * A barre finger doesn't stop at the last string it's fretting — it lies
   * across the neck and keeps going. Silencing a string past the end of a
   * barre means overhanging the tip and damping without pressing, which is
   * why only 8% of curated barre shapes do it. (Silencing a string *inside*
   * the barre is outright impossible, and computeHand now refuses to grant a
   * barre in that case at all.)
   */
  if (hand.barre) {
    const pastBarre = frets.filter((f, i) => f === null && i > hand.barre!.to).length;
    if (pastBarre > 0) {
      score += pastBarre * 2.5;
      flags.push({ kind: "warn", text: "Must mute past the barre" });
    }
  }
  /*
   * There is no penalty here for a barre lying over the strings past it, the
   * way there used to be. computeHand no longer hands out a flat finger that
   * would land on a string that has to ring — it spends the extra fingers, or
   * gives up — so a shape that reaches this point has a barre it can actually
   * hold.
   */
  if (skippedMutes > 0) {
    flags.push({
      kind: "warn",
      text: `Skips ${skippedMutes} string${skippedMutes > 1 ? "s" : ""}`,
    });
  }

  // Bass note quality.
  const bassTone = notes[0].tone;
  if (spec.bassChroma !== null) {
    const wantedBass = midiToPitchClass(notes[0].midi) === spec.bassChroma;
    // Charged, not rejected: a slash bass that is a chord tone still leaves a
    // playable chord when it can't be reached. Say so rather than let the
    // shape pass itself off as the inversion that was asked for.
    if (!wantedBass) {
      score += 5;
      flags.push({ kind: "warn", text: `${spec.bassName} is not the lowest note` });
    }
  } else {
    /*
     * Nobody typing "C" wants an inversion; they want a C, and the shape that
     * happens to have the 3rd on the bottom is a different chord in a
     * progression. Charged enough that dropping the bottom string to get the
     * root underneath — the 0.4 a low-side mute costs — is always the better
     * deal: x-2-2-4-2-4 rather than 0-2-2-4-2-4 when the A string carries the
     * root.
     */
    if (bassTone.role === "root") score -= 2.5;
    else if (bassTone.role === "fifth") score += 1.6;
    else if (bassTone.role === "third") score += 2.6;
    else score += 3.6;
  }
  /*
   * And of two shapes with the same note in the bass, the lower one wins by a
   * little: a bass an octave down is worth a small amount of extra effort.
   * Measured from the open lowest string so it means the same thing in every
   * tuning, and kept under a point per octave so it can't outrank a genuinely
   * easier grip.
   */
  score += (notes[0].midi - strings[0].midi) * 0.06;
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
    score += muddy * 0.8;
  }
  if (harsh) {
    score += harsh * 3;
    flags.push({ kind: "warn", text: "Harsh b9 clash between voices" });
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

/**
 * How awkward the hand shape is, beyond simply counting fingers, given the
 * finger placements computeHand settled on.
 *
 * Number the fingers 1-4 by fret, then by string within a fret. What makes a
 * shape fight back is not reach but *straddling*: fingers on a higher fret
 * sitting on strings either side of fingers on a lower fret. The outer fingers
 * have to press forward while the inner ones stay back, and the hand cannot
 * fan that way.
 *
 *   x31013  fret 1 on D and B, fret 3 on A and high E. Fingers 3 and 4
 *           straddle fingers 1 and 2: two inner fingers, two frets apart.
 *   320003  fret 2 on A, fret 3 on low and high E. Also straddles, but with
 *           one inner finger one fret apart — a standard open G.
 *
 * Cost is innerFingers x fretGap, which puts x31013 at four times open G.
 *
 * A *lower* fret group straddling a higher one is usually just a barre with
 * fingers inside it (every A-shape), so it is free — but only when one finger
 * really is lying across it. In x-3-5-0-4-3 the open G string breaks the fret-3
 * barre, so those are two independent fingers four strings apart with fingers
 * at frets 5 and 4 trapped between them: the same claw, and it is charged the
 * same.
 *
 * Interior open strings cost nothing in themselves — nothing has to be fretted
 * there, and open C rings one happily.
 */
function handAwkwardness(placements: Placement[]): number {
  if (placements.length < 2) return 0;

  const byFret = new Map<number, number[]>();
  for (const p of placements) {
    const list = byFret.get(p.fret) ?? [];
    for (let s = p.from; s <= p.to; s++) list.push(s);
    byFret.set(p.fret, list);
  }

  /** Is this whole group one finger lying flat across it? */
  const oneFinger = (fret: number, from: number, to: number) =>
    placements.some((p) => p.flat && p.fret === fret && p.from <= from && p.to >= to);

  const ordered = [...byFret.keys()].sort((a, b) => a - b);
  const topFret = ordered[ordered.length - 1];
  const bottomFret = ordered[0];
  let straddle = 0;

  for (let a = 0; a < ordered.length; a++) {
    const fretA = ordered[a];
    const stringsA = byFret.get(fretA) as number[];
    const from = Math.min(...stringsA);
    const to = Math.max(...stringsA);
    if (from === to) continue; // a single finger cannot straddle anything

    for (let b = 0; b < ordered.length; b++) {
      if (a === b) continue;
      const fretB = ordered[b];
      // A group only straddles the fingers sitting between its outermost two.
      const trapped = (byFret.get(fretB) as number[]).filter((s) => s > from && s < to).length;
      if (trapped === 0) continue;
      // Straddling from below is free when it is genuinely a barre.
      if (fretA < fretB && oneFinger(fretA, from, to)) continue;
      /*
       * And nothing is trapped when what sits between is the barre itself.
       * D7 as x-5-7-5-7-5 reads as the fret-7 pair straddling a fret-5 finger
       * on the G string, but that G string is under the index barre — the two
       * fingers at 7 have a flat bar beneath them, not a finger to reach
       * around. This is the ordinary A7 shape and must cost nothing.
       *
       * The bar has to run the whole width of the group standing on it, which
       * is what makes it a floor to stand on. It used to be enough that the
       * lower fret was *a* bar anywhere, and that quietly exempted the shape
       * this rule exists to catch: in 4-4-2-2-4-4 the bar at the 2nd fret
       * covers only the two middle strings, and the fingers at the 4th are
       * outside it on both sides with nothing underneath them at all.
       */
      if (fretA > fretB && fretB === bottomFret && oneFinger(fretB, from, to)) continue;
      /*
       * Squared in the fret gap, because reaching around a bar is not linear in
       * how far you reach. x-3-2-2-3-3 bars the D and G at the 2nd fret and puts
       * fingers a single fret past it on both sides — an ordinary shape, and
       * 15% of the curated bars have fingers reaching round them like that. At
       * two frets the hand has to fan both ways at once and hold the spread:
       * 4-4-2-2-4-4 wants the 4th fret on both bass strings and both treble
       * strings around a bar at the 2nd, which is the shape nobody can hold.
       */
      const gap = Math.abs(fretB - fretA);
      straddle += trapped * gap * gap * 0.55;
    }

    /*
     * A split group means separate fingers pinned to one fret with a gap
     * between them. That is free when the split is the *highest* fret — every
     * other finger is behind it and the hand reaches around, which is all open
     * G (320003) asks for. It costs when other fingers sit further up the neck,
     * because now the hand has to hold the spread and reach forward at the same
     * time: x-3-1-0-1-x pins fret 1 across the D and B strings while the ring
     * finger reaches to fret 3.
     */
    if (!oneFinger(fretA, from, to) && fretA !== topFret) {
      straddle += 0.5 + 0.3 * (to - from - 1);
    }
  }

  return straddle;
}

/** One finger, on one fret, covering the strings `from`..`to`. */
export interface Placement {
  fret: number;
  from: number;
  to: number;
  /** True when the finger lies flat across more than one string. */
  flat: boolean;
}

/**
 * Whether one finger can lie flat at `fret` across the strings `from`..`to`.
 *
 * A finger lying flat is a bar across the neck, and a bar is much longer than
 * the strings it means to press. Three things stop it.
 *
 * *Inside* the span, every string has to be pressed at this fret or higher — a
 * flat finger sounds whatever is under it, so an open string or one fretted
 * lower underneath simply isn't there any more.
 *
 * *Past* the span the finger keeps going, and whatever it touches it presses.
 * The tip can be hyperextended to lift clear of the string immediately beyond,
 * which is what makes every A-shape barre playable — x-2-4-4-4-2 has the ring
 * finger flat over D-G-B while the high E rings under the index. What decides
 * whether the tip can do that is not the fret gap but how much finger the bar
 * has already spent. Among the 554 flat fingers in the curated library, bars
 * that overhang a lower-fretted string are 52 two-string bars and 6
 * three-string bars — and not one four-string bar, because by then the finger
 * is at full stretch and the tip has no slack left to lift with. That is the
 * whole difference between x-2-4-4-4-2, which everyone plays, and x-3-3-3-3-2,
 * which is four fingers on the 3s and a fifth on the high E.
 *
 * It clears one string, not a run of them, and no amount of hyperextension
 * clears an *open* string next door: the finger is lying exactly where that
 * string has to ring.
 *
 * Nothing is checked *behind* the span, on the bass side. The shaft crosses
 * those strings on its way in, but it crosses above them, and fingers pressing
 * them at a higher fret come down past the bar rather than over it: x-3-3-3-1-1
 * is a bar on the top two strings at the 1st fret with a finger per string
 * behind it at the 3rd, and 18% of the flat fingers in the curated library
 * reach back like that. It looks like a claw written down and isn't one under
 * the hand.
 */
const WIDEST_OVERHANGING_BAR = 3;

function canLieFlat(frets: (number | null)[], fret: number, from: number, to: number): boolean {
  for (let s = from + 1; s < to; s++) {
    const f = frets[s];
    if (f === null || f < fret) return false;
  }

  // Only the next string along: that is as far as the finger reaches. A bar
  // over the A and D strings has ended by the time you get to the B string,
  // which is why the E-shape minor barre works — 8-10-10-8-8-8 clears the G
  // string with the tip of the ring finger and never comes near the two above.
  const beyond = frets[to + 1];
  if (beyond === undefined || beyond === null || beyond >= fret) return true;
  if (beyond === 0) return false;
  return to - from + 1 <= WIDEST_OVERHANGING_BAR;
}

/**
 * Work out how many fingers a shape needs, and which finger covers what.
 *
 * Calibrated against the 2,069 curated fingerings in @tombatossals/chords-db,
 * which shows one finger covering as many as five strings. The earlier model
 * counted every fretted note above the barre as its own finger, which quietly
 * demoted every A-shape barre: it scored x24442 at four fingers when most
 * players cover the 4-4-4 with a single ring-finger barre and use two.
 *
 * The model is: group fretted notes by fret, and let one finger take each
 * contiguous run of strings at the same fret. The lowest fret additionally gets
 * the full index barre, which may reach across strings fretted higher up.
 *
 * Laying a finger flat is an *option*, not an obligation, and that is the whole
 * difference between a shape that works and one that doesn't. The open A chord
 * x-0-2-2-2-0 is three strings at one fret, but nobody bars them, because the
 * bar would land on the high E that has to ring open — so it costs three
 * fingers rather than one, and that is the honest price. The model used to
 * grant the flat finger anyway and then charge the shape for the damage, which
 * put a four-point "must clear a ringing open string" penalty on open A, open
 * Em and half the first chords anyone learns. Where the fallback runs past four
 * fingers the shape really is unplayable — Fmaj7 as 1-3-2-2-1-0 needs five —
 * and it drops out here rather than surviving as an expensive suggestion.
 */
export function computeHand(
  frets: (number | null)[],
  fretted: VoicingNote[],
): {
  fingers: number;
  barre: { fret: number; from: number; to: number } | null;
  span: number;
  lowestFret: number;
  placements: Placement[];
} | null {
  if (!fretted.length) {
    return { fingers: 0, barre: null, span: 0, lowestFret: 0, placements: [] };
  }
  const fretNumbers = fretted.map((n) => n.fret);
  const lowestFret = Math.min(...fretNumbers);
  const highestFret = Math.max(...fretNumbers);
  const span = highestFret - lowestFret + 1;

  const byFret = new Map<number, number[]>();
  for (const n of fretted) {
    const list = byFret.get(n.fret) ?? [];
    list.push(n.stringIndex);
    byFret.set(n.fret, list);
  }

  const placements: Placement[] = [];
  let barre: { fret: number; from: number; to: number } | null = null;

  for (const fret of [...byFret.keys()].sort((a, b) => a - b)) {
    const strings = (byFret.get(fret) as number[]).sort((a, b) => a - b);

    if (fret === lowestFret && strings.length >= 2) {
      const from = strings[0];
      const to = strings[strings.length - 1];
      // The index barre reaches across strings fretted higher up, which the
      // per-run pass below cannot do. A muted string inside the span rules it
      // out: the barre would sound it whether you wanted it or not.
      if (canLieFlat(frets, fret, from, to)) {
        barre = { fret, from, to };
        placements.push({ fret, from, to, flat: true });
        continue;
      }
    }

    // Otherwise one finger per contiguous run of same-fret strings — this is
    // the ring-finger partial barre that makes A-shapes practical — falling
    // back to a finger per string where that finger can't lie flat.
    const runs: number[][] = [];
    for (const s of strings) {
      const last = runs[runs.length - 1];
      if (last && s === last[last.length - 1] + 1) last.push(s);
      else runs.push([s]);
    }
    for (const run of runs) {
      const from = run[0];
      const to = run[run.length - 1];
      if (from !== to && canLieFlat(frets, fret, from, to)) {
        placements.push({ fret, from, to, flat: true });
      } else {
        for (const s of run) placements.push({ fret, from: s, to: s, flat: false });
      }
    }
  }

  if (placements.length > 4) return null;
  return { fingers: placements.length, barre, span, lowestFret, placements };
}
