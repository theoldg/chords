import { Chord as TonalChord, Note } from "tonal";

/**
 * Chord model.
 *
 * A chord is a root pitch class plus a set of `Tone`s. A tone is a scale
 * degree with an alteration, which is a more workable representation than a
 * bare pitch-class set because the *role* of a note is exactly what decides
 * whether it may be dropped from a voicing.
 *
 * Two entry points produce the same ChordSpec:
 *   - buildChord()       from the block UI (G + minor + add11)
 *   - parseChordSymbol() from typed text ("Gmadd11")
 */

export type Role =
  | "root"
  | "third"
  | "suspension" // the 2 or 4 of a sus chord: stands in for the third
  | "fifth"
  | "sixth"
  | "seventh"
  | "extension" // 9 / 11 / 13
  | "bass"; // a slash bass that is not one of the chord's own tones (Am/G#)

export interface Tone {
  /** Scale degree: 1,2,3,4,5,6,7,9,11,13. */
  degree: number;
  /** -2 = double flat, -1 = flat, 0 = natural, +1 = sharp. */
  alter: number;
  /** Semitones above the root, 0-11. */
  semitones: number;
  role: Role;
  /** True for tones whose alteration is the point of the chord (b5, #9, ...). */
  altered: boolean;
  /** "R", "b3", "5", "#11" ... */
  label: string;
  /** Correctly spelled note name, e.g. "Bb" for the b3 of G minor. */
  noteName: string;
}

export interface ChordSpec {
  /** Canonical display symbol, e.g. "Gm(add11)". */
  symbol: string;
  rootName: string;
  rootChroma: number;
  tones: Tone[];
  /** Optional slash bass, as a pitch class. */
  bassName: string | null;
  bassChroma: number | null;
  /**
   * Set only when the slash bass is *not* already one of `tones` — Am/G#,
   * Dm/B, C/F#. It is deliberately kept out of `tones`: it is not part of the
   * harmony the omission rules reason about, it is a single note that has to
   * sit below the chord, and it may not be doubled anywhere above.
   */
  addedBass: Tone | null;
  /** Human-readable notes about the chord itself (not about a voicing). */
  warnings: string[];
}

const DEGREE_SEMITONES: Record<number, number> = {
  1: 0,
  2: 2,
  3: 4,
  4: 5,
  5: 7,
  6: 9,
  7: 11,
  9: 2,
  11: 5,
  13: 9,
};

/** Degrees that are "perfect" (P/A/d) rather than "major" (M/m/A/d). */
const PERFECT_DEGREES = new Set([1, 4, 5, 11]);

function roleOf(degree: number): Role {
  switch (degree) {
    case 1:
      return "root";
    case 2:
    case 4:
      return "suspension";
    case 3:
      return "third";
    case 5:
      return "fifth";
    case 6:
      return "sixth";
    case 7:
      return "seventh";
    default:
      return "extension";
  }
}

function alterPrefix(alter: number): string {
  if (alter <= -2) return "bb";
  if (alter === -1) return "b";
  if (alter === 1) return "#";
  if (alter >= 2) return "##";
  return "";
}

export function makeTone(degree: number, alter: number, rootName: string): Tone {
  const semitones = (((DEGREE_SEMITONES[degree] + alter) % 12) + 12) % 12;
  const role = roleOf(degree);
  const label = degree === 1 && alter === 0 ? "R" : `${alterPrefix(alter)}${degree}`;
  return {
    degree,
    alter,
    semitones,
    role,
    // A perfect-degree tone is "altered" whenever it moves; a third or seventh
    // moving between major and minor is quality, not alteration.
    altered:
      alter !== 0 && (PERFECT_DEGREES.has(degree) || degree === 9 || degree === 13 || degree === 6),
    label,
    noteName: spellNote(rootName, degree, alter),
  };
}

/** Spell the note as a musician would within this chord (Bb, not A#). */
function spellNote(rootName: string, degree: number, alter: number): string {
  const simpleDegree = degree > 7 ? degree - 7 : degree;
  const quality = PERFECT_DEGREES.has(degree)
    ? alter === 0
      ? "P"
      : alter === -1
        ? "d"
        : "A"
    : alter === 0
      ? "M"
      : alter === -1
        ? "m"
        : alter <= -2
          ? "d"
          : "A";
  const interval = `${simpleDegree}${quality}`;
  const got = Note.transpose(rootName, interval);
  return got || rootName;
}

// ---------------------------------------------------------------------------
// Block builder
// ---------------------------------------------------------------------------

export type Triad = "maj" | "min" | "dim" | "aug" | "sus2" | "sus4" | "five";
export type Seventh = "none" | "6" | "b7" | "maj7";
/** How an extension participates: stacked into the name, or bolted on as add. */
export type ExtensionMode = "off" | "on" | "add";
export type Alteration = "b5" | "#5" | "b9" | "#9" | "#11" | "b13";

export interface ChordBuilderState {
  root: string;
  triad: Triad;
  seventh: Seventh;
  ext9: ExtensionMode;
  ext11: ExtensionMode;
  ext13: ExtensionMode;
  alterations: Alteration[];
  bass: string | null;
}

export const DEFAULT_BUILDER: ChordBuilderState = {
  root: "A",
  triad: "min",
  seventh: "none",
  ext9: "off",
  ext11: "off",
  ext13: "off",
  alterations: [],
  bass: null,
};

const TRIAD_TONES: Record<Triad, { degree: number; alter: number }[]> = {
  maj: [
    { degree: 3, alter: 0 },
    { degree: 5, alter: 0 },
  ],
  min: [
    { degree: 3, alter: -1 },
    { degree: 5, alter: 0 },
  ],
  dim: [
    { degree: 3, alter: -1 },
    { degree: 5, alter: -1 },
  ],
  aug: [
    { degree: 3, alter: 0 },
    { degree: 5, alter: 1 },
  ],
  sus2: [
    { degree: 2, alter: 0 },
    { degree: 5, alter: 0 },
  ],
  sus4: [
    { degree: 4, alter: 0 },
    { degree: 5, alter: 0 },
  ],
  five: [{ degree: 5, alter: 0 }],
};

export function buildChord(state: ChordBuilderState): ChordSpec {
  const root = state.root;
  const specs: { degree: number; alter: number }[] = [{ degree: 1, alter: 0 }];

  for (const t of TRIAD_TONES[state.triad]) specs.push({ ...t });

  if (state.seventh === "6") specs.push({ degree: 6, alter: 0 });
  else if (state.seventh === "b7") specs.push({ degree: 7, alter: -1 });
  else if (state.seventh === "maj7") specs.push({ degree: 7, alter: 0 });

  // A diminished triad with a b7 spelled as bb7 is the fully-diminished chord.
  if (state.triad === "dim" && state.seventh === "6") {
    // "dim6" is really dim7: 6 and bb7 are the same pitch. Prefer the dim7
    // spelling so the label reads correctly.
    const idx = specs.findIndex((s) => s.degree === 6);
    if (idx >= 0) specs[idx] = { degree: 7, alter: -2 };
  }

  if (state.ext9 !== "off") specs.push({ degree: 9, alter: 0 });
  if (state.ext11 !== "off") specs.push({ degree: 11, alter: 0 });
  if (state.ext13 !== "off") specs.push({ degree: 13, alter: 0 });

  for (const alt of state.alterations) {
    const [prefix, degStr] = [alt.slice(0, 1), alt.slice(1)];
    const degree = Number(degStr);
    const alter = prefix === "b" ? -1 : 1;
    // Alterations replace the natural version of the same degree.
    const existing = specs.findIndex((s) => s.degree === degree);
    if (existing >= 0) specs[existing] = { degree, alter };
    else specs.push({ degree, alter });
  }

  const tones = dedupeTones(specs.map((s) => makeTone(s.degree, s.alter, root)));
  return finishSpec(nameFromBuilder(state), root, tones, state.bass);
}

/**
 * Build a display symbol from the block state. This is cosmetic — the tones
 * above are the source of truth — but it should read the way a musician would
 * write it.
 */
function nameFromBuilder(s: ChordBuilderState): string {
  const alts = new Set(s.alterations);
  let base = "";

  switch (s.triad) {
    case "min":
      base = "m";
      break;
    case "dim":
      base = s.seventh === "b7" ? "m" : "dim";
      break;
    case "aug":
      base = "aug";
      break;
    case "sus2":
      base = "sus2";
      break;
    case "sus4":
      base = "sus4";
      break;
    case "five":
      base = "5";
      break;
    case "maj":
      base = "";
      break;
  }

  // Half-diminished reads better than "mdim" for m7b5.
  if (s.triad === "dim" && s.seventh === "b7") alts.add("b5");
  if (s.triad === "dim" && s.seventh === "maj7") base = "dim";

  const stacked: number[] = [];
  const added: number[] = [];
  if (s.ext9 === "on") stacked.push(9);
  if (s.ext9 === "add") added.push(9);
  if (s.ext11 === "on") stacked.push(11);
  if (s.ext11 === "add") added.push(11);
  if (s.ext13 === "on") stacked.push(13);
  if (s.ext13 === "add") added.push(13);

  let seventhPart = "";
  const top = stacked.length ? Math.max(...stacked) : null;

  if (s.seventh === "maj7") seventhPart = top ? `maj${top}` : "maj7";
  else if (s.seventh === "b7") seventhPart = top ? `${top}` : "7";
  else if (s.seventh === "6") seventhPart = stacked.includes(9) ? "6/9" : "6";
  else if (top) seventhPart = `${top}`; // e.g. "Gm11" with no 7th is unusual but legal

  if (s.triad === "dim" && s.seventh === "6") seventhPart = "7";

  let out = `${s.root}${base}${seventhPart}`;

  const parenParts: string[] = [];
  for (const a of ["b5", "#5", "b9", "#9", "#11", "b13"] as Alteration[]) {
    if (alts.has(a)) {
      // b5 is already implied by the dim triad label.
      if (a === "b5" && s.triad === "dim" && s.seventh !== "b7") continue;
      if (a === "#5" && s.triad === "aug") continue;
      parenParts.push(a);
    }
  }
  for (const a of added) parenParts.push(`add${a}`);

  if (parenParts.length) out += `(${parenParts.join(",")})`;
  if (s.bass) out += `/${s.bass}`;
  return out;
}

// ---------------------------------------------------------------------------
// Text parser
// ---------------------------------------------------------------------------

/**
 * tonal's chord dictionary is good but has real gaps — notably `add11`,
 * `madd11` and any parenthesised form all come back empty. So: normalise the
 * text, pull `add`/`no` modifiers out ourselves, let tonal handle the base
 * quality, then reassemble.
 */
export function parseChordSymbol(input: string): { spec: ChordSpec | null; error: string | null } {
  let text = input
    .trim()
    .replace(/[♭]/g, "b")
    .replace(/[♯]/g, "#")
    .replace(/[Δ^]/g, "maj7")
    .replace(/[øΦ]/g, "m7b5")
    .replace(/[°o]/g, "dim")
    .replace(/[−–—]/g, "-");

  if (!text) return { spec: null, error: "Enter a chord." };

  // Slash bass: only split when the right-hand side is a note name, so that
  // "C6/9" survives.
  let bass: string | null = null;
  const slash = text.lastIndexOf("/");
  if (slash > 0) {
    const rhs = text.slice(slash + 1);
    if (/^[A-G][b#]?$/.test(rhs)) {
      bass = rhs;
      text = text.slice(0, slash);
    }
  }

  // Pull out add / no modifiers.
  const adds: { degree: number; alter: number }[] = [];
  const omits: number[] = [];
  text = text.replace(/add([b#]?)(\d{1,2})/gi, (_m, acc: string, deg: string) => {
    adds.push({ degree: Number(deg), alter: acc === "b" ? -1 : acc === "#" ? 1 : 0 });
    return "";
  });
  text = text.replace(/no(\d{1,2})/gi, (_m, deg: string) => {
    omits.push(Number(deg));
    return "";
  });
  text = text.replace(/[()]/g, "").replace(/,/g, "").trim();

  // "mmaj7" / "minmaj7" / "min/maj7" / "mMAJ7" etc all mean minor/major
  // seventh, but tonal only recognises the exact casing "mMaj7".
  text = text.replace(/m(in)?\/?maj/gi, "mMaj");

  const rootMatch = /^([A-G][b#]?)/.exec(text);
  if (!rootMatch) {
    return { spec: null, error: "Start with a root note, A-G (use lowercase b for flats)." };
  }
  const root = rootMatch[1];
  const quality = text.slice(root.length);

  let toneSpecs: { degree: number; alter: number }[];

  if (quality === "" && adds.length) {
    // "Cadd9" with the add stripped leaves a bare root: that's a major triad.
    toneSpecs = [
      { degree: 1, alter: 0 },
      { degree: 3, alter: 0 },
      { degree: 5, alter: 0 },
    ];
  } else {
    const chord = TonalChord.get(`${root}${quality}`);
    if (chord.empty || !chord.intervals.length) {
      return {
        spec: null,
        error: `I don't recognise "${input.trim()}". Try the blocks above, or a form like Gm7, Cmaj9, E7#9.`,
      };
    }
    toneSpecs = chord.intervals.map(intervalToDegree);
  }

  for (const a of adds) toneSpecs.push(a);
  if (omits.length) toneSpecs = toneSpecs.filter((t) => !omits.includes(t.degree));

  const tones = dedupeTones(toneSpecs.map((t) => makeTone(t.degree, t.alter, root)));
  if (!tones.length) return { spec: null, error: "That leaves no notes." };

  return { spec: finishSpec(input.trim(), root, tones, bass), error: null };
}

/** "3m" -> {degree:3, alter:-1};  "7d" -> {degree:7, alter:-2}. */
function intervalToDegree(interval: string): { degree: number; alter: number } {
  const m = /^(\d+)([PMmdA]+)$/.exec(interval);
  if (!m) return { degree: 1, alter: 0 };
  const degree = Number(m[1]);
  const q = m[2];
  const simple = degree > 7 ? degree - 7 : degree;
  const isPerfect = PERFECT_DEGREES.has(simple) || simple === 1;
  let alter = 0;
  if (q === "M" || q === "P") alter = 0;
  else if (q === "m") alter = -1;
  else if (q.startsWith("A")) alter = q.length;
  else if (q.startsWith("d")) alter = isPerfect ? -q.length : -q.length - 1;
  return { degree, alter };
}

function dedupeTones(tones: Tone[]): Tone[] {
  const byDegree = new Map<number, Tone>();
  for (const t of tones) byDegree.set(t.degree, t);
  return [...byDegree.values()].sort((a, b) => a.degree - b.degree);
}

function finishSpec(
  symbol: string,
  rootName: string,
  tones: Tone[],
  bassName: string | null,
): ChordSpec {
  const warnings: string[] = [];
  const hasMajorThird = tones.some((t) => t.degree === 3 && t.alter === 0);
  const hasNatural11 = tones.some((t) => t.degree === 11 && t.alter === 0);
  if (hasMajorThird && hasNatural11) {
    warnings.push(
      "The natural 11 sits a semitone above the major 3rd — a classic clash. Most players raise it to #11 or drop the 3rd (sus4).",
    );
  }
  const hasSeventh = tones.some((t) => t.role === "seventh");
  const hasSixth = tones.some((t) => t.role === "sixth");
  if (hasSeventh && hasSixth) {
    warnings.push("Both a 6th and a 7th — unusual; the 6th is normally spelled as a 13.");
  }

  const rootChroma = Note.chroma(rootName) ?? 0;
  const bassChroma = bassName ? (Note.chroma(bassName) ?? null) : null;

  /*
   * A slash bass that isn't in the chord is not a mistake — Am/G#, Dm/B and
   * C/F# are ordinary line-cliché and pedal-point writing. Give it a tone of
   * its own so the search can actually fret it, marked `bass` so nothing
   * mistakes it for part of the harmony: it is not a candidate for omission,
   * and it belongs on the lowest sounding string only.
   */
  let addedBass: Tone | null = null;
  if (bassChroma !== null && !tones.some((t) => (rootChroma + t.semitones) % 12 === bassChroma)) {
    addedBass = makeBassTone(rootName, bassName as string);
    warnings.push(
      `${addedBass.noteName} isn't a tone of ${symbol.split("/")[0]} — it's played as a bass note under the chord (the ${addedBass.label}), on the lowest string only.`,
    );
  }

  return {
    symbol,
    rootName,
    rootChroma,
    tones,
    bassName,
    bassChroma,
    addedBass,
    warnings,
  };
}

/**
 * The slash bass as a degree of the chord's root, so it can be labelled and
 * coloured like any other tone. `Note.distance` spells a flattened root as a
 * diminished octave ("A" -> "Ab" is 8d), which folds back to a b1.
 */
function makeBassTone(rootName: string, bassName: string): Tone {
  const distance = Note.distance(rootName, bassName);
  const { degree, alter } = intervalToDegree(distance || "1P");
  const simple = degree > 7 ? degree - 7 : degree;
  const tone = makeTone(simple, alter, rootName);
  // `altered` would make the omission rules treat it as the point of the
  // chord, and its degree is the root's business, not the bass note's.
  return { ...tone, role: "bass", altered: false, noteName: bassName };
}

export interface ProgressionEntry {
  /** Exactly what the user typed, for echoing back in errors. */
  text: string;
  spec: ChordSpec | null;
  error: string | null;
  /** Where the symbol sits in the input, so the field can mark it in place. */
  start: number;
  end: number;
}

/**
 * Split a typed progression into chords. Accepts whitespace, commas, newlines
 * and bar lines as separators, so pasting "Am7 | D7 | Gmaj7" works as-is.
 *
 * Matched rather than split, because the caller needs to know *where* each
 * symbol was: the input underlines the ones it could not read, and it can only
 * do that against offsets into the original text.
 */
export function parseProgression(input: string): ProgressionEntry[] {
  const entries: ProgressionEntry[] = [];
  for (const m of input.matchAll(/[^\s,|]+/g)) {
    const text = m[0];
    if (text === "-") continue;
    const { spec, error } = parseChordSymbol(text);
    entries.push({ text, spec, error, start: m.index, end: m.index + text.length });
  }
  return entries;
}

export const ROOT_CHOICES = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];
