import type { Voicing } from "../theory/search";
import type { Tuning } from "../theory/tuning";

const FRETS_SHOWN = 5;

/**
 * The inlay dots a guitar has on its fingerboard, repeating every octave, so a
 * windowed diagram reads against the same landmarks as the neck in your hands.
 * Drawn between the strings rather than on them so they never read as notes.
 */
function inlay(fret: number): 0 | 1 | 2 {
  if (fret <= 0) return 0;
  const within = fret % 12;
  if (within === 0) return 2;
  return within === 5 || within === 7 || within === 9 ? 1 : 0;
}

interface Props {
  voicing: Voicing;
  tuning: Tuning;
  showDegrees: boolean;
}

export function ChordDiagram({ voicing, tuning, showDegrees }: Props) {
  const stringCount = tuning.strings.length;
  const width = 34 + (stringCount - 1) * 26;
  const height = 210;
  const left = 22;
  const top = 34;
  const stringGap = 26;
  const fretGap = 30;

  const fretted = voicing.frets.filter((f): f is number => f !== null && f > 0);
  // Show from the nut when the shape is low enough, otherwise window the neck.
  const startFret =
    fretted.length === 0 || Math.max(...fretted) <= FRETS_SHOWN
      ? 0
      : Math.min(...fretted) - 1;

  /*
   * Which fret the shape sits at, called out from the 3rd position up. A
   * windowed diagram has always needed it — nothing else says where you are on
   * the neck — but a shape drawn from the nut needs it too once it leaves first
   * position: x-3-5-5-5-3 and x-3-0-0-3-0 both start at the 3rd fret and used
   * to be labelled only by the fret lines you had to count yourself.
   */
  const position = fretted.length ? Math.min(...fretted) : 0;
  const showPosition = position >= 3;

  /*
   * Whether the lowest sounding string is carrying something other than the
   * root. That changes what the chord is called and what it does under a
   * progression, and the diagram is where you notice it — the engine's "3rd in
   * the bass" flag is text, and the progression view shows warnings only.
   */
  const inverted = voicing.bassTone !== null && voicing.bassTone.role !== "root";
  const bassString = voicing.notes[0]?.stringIndex;

  const openTone = (stringIndex: number) =>
    voicing.notes.find((n) => n.stringIndex === stringIndex && n.fret === 0)?.tone;

  const x = (stringIndex: number) => left + stringIndex * stringGap;
  const y = (fret: number) => top + (fret - startFret - 0.5) * fretGap;

  // The origin sits left of the fretboard to leave room for a two-digit
  // position marker; a 12th-fret shape overflowed even at the old size.
  return (
    <svg
      viewBox={`-12 0 ${width + 32} ${height}`}
      className="diagram"
      role="img"
      aria-label={`Chord diagram, frets ${voicing.frets.map((f) => (f === null ? "muted" : f)).join(" ")}`}
    >
      {/* Nut */}
      {startFret === 0 && (
        <rect x={left - 2} y={top - 5} width={(stringCount - 1) * stringGap + 4} height={5} rx={1.5} className="nut" />
      )}

      {/* Position marker, alongside the fret the shape starts on */}
      {showPosition && (
        <text x={left - 11} y={y(position) + 5.5} className="position-label" textAnchor="end">
          {position}
        </text>
      )}

      {/* Frets */}
      {Array.from({ length: FRETS_SHOWN + 1 }, (_, i) => (
        <line
          key={`f${i}`}
          x1={left}
          x2={left + (stringCount - 1) * stringGap}
          y1={top + i * fretGap}
          y2={top + i * fretGap}
          className="fret"
        />
      ))}

      {/* Fingerboard inlays, behind the strings so a dot never competes with a
          note. Kept faint: they are for orientation, not information. */}
      {Array.from({ length: FRETS_SHOWN }, (_, i) => startFret + i + 1).map((fret) => {
        const marks = inlay(fret);
        if (marks === 0) return null;
        const mid = left + ((stringCount - 1) * stringGap) / 2;
        const spread = marks === 2 ? stringGap * 0.7 : 0;
        return (
          <g key={`i${fret}`} className="inlay">
            {(marks === 2 ? [-spread, spread] : [0]).map((dx) => (
              <circle key={dx} cx={mid + dx} cy={y(fret)} r={3.2} />
            ))}
          </g>
        );
      })}

      {/* Strings */}
      {tuning.strings.map((_, i) => (
        <line
          key={`s${i}`}
          x1={x(i)}
          x2={x(i)}
          y1={top}
          y2={top + FRETS_SHOWN * fretGap}
          className="string"
        />
      ))}

      {/* Barre */}
      {voicing.barre && voicing.barre.fret - startFret <= FRETS_SHOWN && (
        <rect
          x={x(voicing.barre.from) - 9}
          y={y(voicing.barre.fret) - 9}
          width={(voicing.barre.to - voicing.barre.from) * stringGap + 18}
          height={18}
          rx={9}
          className="barre"
        />
      )}

      {/* Open / muted markers. Open rings take the colour of the degree they
          sound, so a diagram reads the same above the nut as below it. */}
      {voicing.frets.map((fret, i) =>
        fret === null ? (
          <g key={`m${i}`} className="muted-mark">
            <line x1={x(i) - 5} y1={top - 18} x2={x(i) + 5} y2={top - 8} />
            <line x1={x(i) + 5} y1={top - 18} x2={x(i) - 5} y2={top - 8} />
          </g>
        ) : fret === 0 ? (
          <circle
            key={`o${i}`}
            cx={x(i)}
            cy={top - 13}
            r={5}
            className={`open-mark role-${openTone(i)?.role ?? "fifth"}`}
          />
        ) : null,
      )}

      {/* Fingered dots */}
      {voicing.notes
        .filter((n) => n.fret > 0)
        .map((n) => (
          <g key={`d${n.stringIndex}`}>
            <circle cx={x(n.stringIndex)} cy={y(n.fret)} r={10} className={`dot role-${n.tone.role}`} />
            {showDegrees && (
              <text x={x(n.stringIndex)} y={y(n.fret) + 3.5} className="dot-label" textAnchor="middle">
                {n.tone.label}
              </text>
            )}
          </g>
        ))}

      {/* Degree labels under open strings */}
      {showDegrees &&
        voicing.notes
          .filter((n) => n.fret === 0)
          .map((n) => (
            <text
              key={`ol${n.stringIndex}`}
              x={x(n.stringIndex)}
              y={top - 24}
              className={`open-label role-${n.tone.role}`}
              textAnchor="middle"
            >
              {n.tone.label}
            </text>
          ))}

      {/* Note names along the bottom, with the bass highlighted when the shape
          is not sitting on its root, so the string carrying it is findable at
          a glance. The card's "over b3" tag names the degree. */}
      {tuning.strings.map((_, i) => {
        const note = voicing.notes.find((n) => n.stringIndex === i);
        const isBass = inverted && i === bassString;
        return (
          <text
            key={`n${i}`}
            x={x(i)}
            y={top + FRETS_SHOWN * fretGap + 18}
            className={
              note
                ? isBass
                  ? `note-name bass role-${note.tone.role}`
                  : "note-name"
                : "note-name muted"
            }
            textAnchor="middle"
          >
            {isBass && <title>{`${voicing.bassTone?.label} in the bass`}</title>}
            {note ? note.tone.noteName : "×"}
          </text>
        );
      })}
    </svg>
  );
}
