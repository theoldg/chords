import type { Voicing } from "../theory/search";
import type { Tuning } from "../theory/tuning";

const FRETS_SHOWN = 5;

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

  const x = (stringIndex: number) => left + stringIndex * stringGap;
  const y = (fret: number) => top + (fret - startFret - 0.5) * fretGap;

  return (
    <svg
      viewBox={`0 0 ${width + 20} ${height}`}
      className="diagram"
      role="img"
      aria-label={`Chord diagram, frets ${voicing.frets.map((f) => (f === null ? "muted" : f)).join(" ")}`}
    >
      {/* Nut or position marker */}
      {startFret === 0 ? (
        <rect x={left - 2} y={top - 5} width={(stringCount - 1) * stringGap + 4} height={5} rx={1.5} className="nut" />
      ) : (
        <text x={left - 10} y={top + fretGap * 0.62} className="position-label" textAnchor="end">
          {startFret + 1}
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

      {/* Open / muted markers */}
      {voicing.frets.map((fret, i) =>
        fret === null ? (
          <g key={`m${i}`} className="muted-mark">
            <line x1={x(i) - 5} y1={top - 18} x2={x(i) + 5} y2={top - 8} />
            <line x1={x(i) + 5} y1={top - 18} x2={x(i) - 5} y2={top - 8} />
          </g>
        ) : fret === 0 ? (
          <circle key={`o${i}`} cx={x(i)} cy={top - 13} r={5} className="open-mark" />
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
              className="open-label"
              textAnchor="middle"
            >
              {n.tone.label}
            </text>
          ))}

      {/* Note names along the bottom */}
      {tuning.strings.map((_, i) => {
        const note = voicing.notes.find((n) => n.stringIndex === i);
        return (
          <text
            key={`n${i}`}
            x={x(i)}
            y={top + FRETS_SHOWN * fretGap + 18}
            className={note ? "note-name" : "note-name muted"}
            textAnchor="middle"
          >
            {note ? note.tone.noteName : "×"}
          </text>
        );
      })}
    </svg>
  );
}
