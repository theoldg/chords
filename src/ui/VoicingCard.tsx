import type { CSSProperties } from "react";
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
/**
 * How wide the fret row needs to be, in ems, so the stylesheet can pick a size
 * that fits the card.
 *
 * Measured from the digits actually in this shape rather than from the worst a
 * shape could be: budgeting two digits per string everywhere would shrink
 * `x 0 2 0 1 0` to pay for the 11th-fret barre two cards over. Monospace, so
 * the count of characters is the measurement — 0.62em is the widest advance
 * among the fonts in the mono stack, and the 0.35em between entries is what
 * keeps them reading as six numbers rather than one.
 */
function fretBudget(frets: (number | null)[]): number {
  const characters = frets.reduce<number>((n, f) => n + (f === null ? 1 : String(f).length), 0);
  return characters * 0.62 + (frets.length - 1) * 0.35;
}

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
      {/*
        One cell per string rather than one joined string, and a budget of how
        much room this particular row needs, so the stylesheet can size it to
        fit instead of wrapping. Hidden from screen readers because the
        diagram below already announces the same frets in its label.

        It gets the card's whole width: the play button used to share the row
        and pushed the numbers off the strings they name, which is the one
        alignment on the card that has to hold.
      */}
      <span
        className="mono frets"
        aria-hidden="true"
        style={{ "--fret-budget": fretBudget(voicing.frets) } as CSSProperties}
      >
        {voicing.frets.map((f, i) => (
          <span key={i}>{f === null ? "x" : f}</span>
        ))}
      </span>

      <ChordDiagram voicing={voicing} tuning={tuning} showDegrees={showDegrees} />

      <div className="card-foot">
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
              over{" "}
              {voicing.bassTone.role === "bass"
                ? voicing.bassTone.noteName
                : voicing.bassTone.label}
            </span>
          )}
          {voicing.omitted.map((o) => {
            const rule = rules.find((r) => r.tone.degree === o.tone.degree);
            // The category ("expendable", "implied by the 7th") is on hover
            // with the full explanation; the badge itself only names the tone.
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

        <button
          type="button"
          className="play"
          onClick={() => strum(voicing.notes.map((n) => n.midi))}
          aria-label={playLabel}
        >
          ▶
        </button>
      </div>
    </article>
  );
}
