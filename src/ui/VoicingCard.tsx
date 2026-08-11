import type { ToneRule } from "../theory/rules";
import type { Voicing } from "../theory/search";
import type { Tuning } from "../theory/tuning";
import { strum } from "../audio/pluck";
import { ChordDiagram } from "./ChordDiagram";

interface Props {
  voicing: Voicing;
  tuning: Tuning;
  /** The analysis the voicing came from, for explaining what it dropped. */
  rules: ToneRule[];
  showDegrees: boolean;
  /** What the play button announces, e.g. "Play Am7". */
  playLabel: string;
  className?: string;
  role?: string;
}

/**
 * One voicing: the frets, the diagram, and only what the diagram cannot say.
 *
 * Shared by the single-chord grid and the progression strip. They had drifted
 * into two copies of the same tile that disagreed on wording and on which
 * badges to show, so a chord looked different depending on how you searched
 * for it.
 *
 * The tile is deliberately thin. Anything you can read off the diagram is not
 * repeated in text — the barre as a grey bar with its fret number beside it,
 * an open shape by its rings, the finger and string counts by the dots
 * themselves, the top note by which dot is highest. What is left is what a
 * picture of a hand position genuinely cannot tell you: which tones the shape
 * had to drop and why, anything that will fight back under the fingers, and
 * whether it is sitting on something other than its root.
 */
export function VoicingCard({
  voicing,
  tuning,
  rules,
  showDegrees,
  playLabel,
  className,
  role,
}: Props) {
  return (
    <article className={className ? `card ${className}` : "card"} role={role}>
      <div className="card-top">
        <span className="mono frets">
          {voicing.frets.map((f) => (f === null ? "x" : f)).join(" ")}
        </span>
        <button
          type="button"
          className="play"
          onClick={() => strum(voicing.notes.map((n) => n.midi))}
          aria-label={playLabel}
        >
          ▶
        </button>
      </div>

      <ChordDiagram voicing={voicing} tuning={tuning} showDegrees={showDegrees} />

      <div className="badges">
        {voicing.bassTone && voicing.bassTone.role !== "root" && (
          <span
            className={`badge bass role-${voicing.bassTone.role}`}
            title={
              voicing.bassTone.role === "bass"
                ? "The lowest string is the slash bass, from outside the chord"
                : "The lowest string is not the root"
            }
          >
            over {voicing.bassTone.role === "bass" ? voicing.bassTone.noteName : voicing.bassTone.label}
          </span>
        )}
        {voicing.omitted.map((o) => {
          const rule = rules.find((r) => r.tone.degree === o.tone.degree);
          // The category ("expendable", "implied by the 7th") is on hover with
          // the full explanation; the badge itself only needs to name the tone.
          return (
            <span className="badge omit" key={o.tone.degree} title={rule?.explanation ?? ""}>
              omits {o.label}
            </span>
          );
        })}
        {voicing.flags
          .filter((f) => f.kind === "warn")
          .map((f) => (
            <span className={`badge ${f.kind}`} key={f.text}>
              {f.text}
            </span>
          ))}
      </div>
    </article>
  );
}
