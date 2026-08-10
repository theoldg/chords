import { Note } from "tonal";

/**
 * Tuning parsing.
 *
 * Strings are stored as MIDI numbers, ordered low (thickest) -> high.
 *
 * Input conventions, documented in the UI:
 *   - Note letters are UPPERCASE (A-G), accidentals are lowercase `b` or `#`.
 *     This is what disambiguates "Bb" (one string, B-flat) from "BB" (two B
 *     strings). Without that rule "DAEGAD"-style shorthand is unparseable.
 *   - An optional octave digit pins a string exactly: "D2 A2 E3 G3 A3 D4".
 *   - Any string without an octave is placed at the lowest pitch strictly
 *     above the previous string, which is how essentially every real tuning
 *     is laid out.
 */

export interface GuitarString {
  /** MIDI note number of the open string. */
  midi: number;
  /** Display name, e.g. "D2". */
  name: string;
}

export interface Tuning {
  strings: GuitarString[];
}

export interface TuningParseResult {
  tuning: Tuning | null;
  error: string | null;
}

/** Where the lowest string lands when no octave is given. */
const DEFAULT_LOWEST_MIDI = 40; // E2, the standard guitar 6th string.

const TOKEN_RE = /^([A-G])([b#]*)(\d)?/;

export function parseTuning(input: string): TuningParseResult {
  const cleaned = input.replace(/[♭]/g, "b").replace(/[♯]/g, "#").trim();
  if (!cleaned) return { tuning: null, error: "Enter a tuning, e.g. DADGAD." };

  // Split on whitespace/commas/dashes if the user used separators; otherwise
  // scan the raw string token by token.
  const chunks = cleaned.split(/[\s,\-_|]+/).filter(Boolean);
  const raw = chunks.join("");

  const tokens: { letter: string; acc: string; octave: number | null }[] = [];
  let i = 0;
  while (i < raw.length) {
    const m = TOKEN_RE.exec(raw.slice(i));
    if (!m) {
      return {
        tuning: null,
        error: `Couldn't read "${raw[i]}" at position ${i + 1}. Use uppercase letters A-G, lowercase b for flats (e.g. EbADGBE).`,
      };
    }
    tokens.push({ letter: m[1], acc: m[2] ?? "", octave: m[3] ? Number(m[3]) : null });
    i += m[0].length;
  }

  if (tokens.length < 3) {
    return { tuning: null, error: "A tuning needs at least 3 strings." };
  }
  if (tokens.length > 12) {
    return { tuning: null, error: "That's more than 12 strings — probably a typo." };
  }

  const strings: GuitarString[] = [];
  for (const t of tokens) {
    const pitchClassName = t.letter + t.acc;
    let midi: number;

    if (t.octave !== null) {
      const got = Note.midi(`${pitchClassName}${t.octave}`);
      if (got == null) {
        return { tuning: null, error: `"${pitchClassName}${t.octave}" isn't a note I understand.` };
      }
      midi = got;
    } else {
      const chroma = Note.chroma(pitchClassName);
      if (chroma == null) {
        return { tuning: null, error: `"${pitchClassName}" isn't a note I understand.` };
      }
      if (strings.length === 0) {
        // Place the lowest string near the standard 6th string, so DADGAD and
        // EADGBE land where a guitarist expects rather than in some odd octave.
        midi = nearestMidiWithChroma(chroma, DEFAULT_LOWEST_MIDI);
      } else {
        midi = lowestMidiAbove(chroma, strings[strings.length - 1].midi);
      }
    }
    strings.push({ midi, name: midiToName(midi) });
  }

  return { tuning: { strings }, error: null };
}

/** Smallest MIDI number with the given chroma that is strictly above `floor`. */
function lowestMidiAbove(chroma: number, floor: number): number {
  let m = Math.floor(floor / 12) * 12 + chroma;
  while (m <= floor) m += 12;
  return m;
}

function nearestMidiWithChroma(chroma: number, target: number): number {
  const base = Math.floor(target / 12) * 12 + chroma;
  let best = base;
  let bestDist = Math.abs(base - target);
  for (const cand of [base - 12, base + 12]) {
    const d = Math.abs(cand - target);
    if (d < bestDist) {
      best = cand;
      bestDist = d;
    }
  }
  return best;
}

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToName(midi: number): string {
  return `${SHARP_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function midiToPitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export interface TuningPreset {
  label: string;
  value: string;
  note?: string;
}

export const TUNING_PRESETS: TuningPreset[] = [
  { label: "Standard", value: "EADGBE" },
  { label: "DADGAD", value: "DADGAD", note: "Celtic / modal" },
  { label: "Drop D", value: "DADGBE" },
  { label: "Open G", value: "DGDGBD", note: "Keef" },
  { label: "Open D", value: "DADF#AD" },
  { label: "Open E", value: "EBEG#BE" },
  { label: "Open C", value: "CGCGCE" },
  { label: "DAEGAD", value: "DAEGAD", note: "your example" },
  { label: "Half step down", value: "EbAbDbGbBbEb" },
  { label: "Bass (4)", value: "E1A1D2G2" },
  { label: "7-string", value: "B1EADGBE" },
  { label: "Ukulele", value: "G4C4E4A4", note: "re-entrant" },
];
