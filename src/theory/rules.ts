import type { ChordSpec, Tone } from "./chord";

/**
 * Which chord tones a voicing is allowed to leave out.
 *
 * There is no authoritative machine-readable source for this — the chord
 * databases on the web are collections of *shapes*, not of reasoning, so they
 * can't say why a shape is legal or what it dropped. So the rules are encoded
 * here explicitly, from the standard pedagogy:
 *
 *   - Mark Levine, "The Jazz Theory Book" — guide tones (3rd + 7th carry the
 *     quality), rootless voicings, and the 5th as the first tone to go.
 *   - Ted Greene, "Chord Chemistry" — the guitar-specific canon on what to
 *     drop when you only have four fingers.
 *   - Berklee arranging texts — low interval limits, and the natural 11 as an
 *     avoid note over a major 3rd.
 *
 * The point of encoding it as rules rather than baking in a shape library is
 * that every omission comes back with a reason attached, which is what the UI
 * shows the player.
 */

export type OmissionReason =
  | "perfect-fifth-expendable"
  | "root-covered-by-bass"
  | "ninth-under-thirteenth"
  | "eleventh-under-thirteenth";

export interface ToneRule {
  tone: Tone;
  required: boolean;
  /** Cost added to a voicing's score when this tone is missing. Lower = freer. */
  omissionCost: number;
  reason: OmissionReason | null;
  /** Why it's required — shown in the "rules applied" panel. */
  explanation: string;
}

export interface RuleOptions {
  /**
   * "A bass player has the root." Enables rootless voicings, which are
   * standard in ensemble comping and nonsense when playing solo.
   */
  allowRootOmission: boolean;
}

export function analyseTones(spec: ChordSpec, opts: RuleOptions): ToneRule[] {
  const extensions = spec.tones.filter((t) => t.role === "extension");
  const topExtensionDegree = extensions.length
    ? Math.max(...extensions.map((t) => t.degree))
    : null;

  return spec.tones.map((tone): ToneRule => {
    // Altered tones are the reason the chord has the name it has. Never drop.
    if (tone.altered) {
      return {
        tone,
        required: true,
        omissionCost: Infinity,
        reason: null,
        explanation: `${tone.label} is an altered tone — it's what makes this chord that chord.`,
      };
    }

    switch (tone.role) {
      case "root":
        return opts.allowRootOmission
          ? {
              tone,
              required: false,
              omissionCost: 6,
              reason: "root-covered-by-bass",
              explanation:
                "Root may be dropped because you've said a bass is covering it (rootless voicing).",
            }
          : {
              tone,
              required: true,
              omissionCost: Infinity,
              reason: null,
              explanation: "Root is required — turn on “a bassist has the root” to allow dropping it.",
            };

      case "third":
        return {
          tone,
          required: true,
          omissionCost: Infinity,
          reason: null,
          explanation: `${tone.label} defines major vs minor — dropping it makes the chord ambiguous.`,
        };

      case "suspension":
        return {
          tone,
          required: true,
          omissionCost: Infinity,
          reason: null,
          explanation: `The ${tone.label} replaces the 3rd in a sus chord — without it there's no chord left.`,
        };

      case "seventh":
      case "sixth":
        return {
          tone,
          required: true,
          omissionCost: Infinity,
          reason: null,
          explanation: `${tone.label} is a guide tone — with the 3rd it carries the chord quality.`,
        };

      case "fifth":
        // The headline rule. A perfect 5th adds no information the root and
        // overtone series don't already supply.
        return {
          tone,
          required: false,
          omissionCost: 1,
          reason: "perfect-fifth-expendable",
          explanation:
            "A perfect 5th is the most expendable tone — it adds no colour the root doesn't already imply.",
        };

      case "extension": {
        if (topExtensionDegree !== null && tone.degree === topExtensionDegree) {
          return {
            tone,
            required: true,
            omissionCost: Infinity,
            reason: null,
            explanation: `The ${tone.label} is the extension this chord is named for — dropping it changes the chord.`,
          };
        }
        // A 9 or 11 sitting under a 13 is filler; standard practice on a 13th
        // chord is to play root/3/b7/13 and leave the middle out.
        return {
          tone,
          required: false,
          omissionCost: tone.degree === 11 ? 2 : 2.5,
          reason: tone.degree === 11 ? "eleventh-under-thirteenth" : "ninth-under-thirteenth",
          explanation: `The ${tone.label} sits below the top extension and is routinely left out.`,
        };
      }
    }
  });
}

export const OMISSION_LABELS: Record<OmissionReason, string> = {
  "perfect-fifth-expendable": "5th is expendable",
  "root-covered-by-bass": "bass covers the root",
  "ninth-under-thirteenth": "9th is filler here",
  "eleventh-under-thirteenth": "11th is filler here",
};

/**
 * Low interval limits (Berklee arranging). Below these pitches an interval
 * turns to mud. Keyed by interval size in semitones -> lowest MIDI note the
 * lower voice may sit on.
 */
const LOW_INTERVAL_LIMITS: Record<number, number> = {
  1: 52, // m2  -> E3
  2: 51, // M2  -> Eb3
  3: 48, // m3  -> C3
  4: 46, // M3  -> Bb2
  5: 46, // P4  -> Bb2
  6: 46, // TT  -> Bb2
  7: 34, // P5  -> Bb1
  8: 43, // m6  -> G2
  9: 41, // M6  -> F2
  10: 41, // m7 -> F2
  11: 41, // M7 -> F2
};

/** Returns true when the pair of adjacent voices will sound muddy. */
export function violatesLowIntervalLimit(lowerMidi: number, upperMidi: number): boolean {
  const gap = upperMidi - lowerMidi;
  if (gap <= 0 || gap > 11) return false;
  const limit = LOW_INTERVAL_LIMITS[gap];
  return limit !== undefined && lowerMidi < limit;
}
