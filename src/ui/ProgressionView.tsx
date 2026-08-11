import { useMemo } from "react";
import { parseProgression } from "../theory/chord";
import { OMISSION_LABELS } from "../theory/rules";
import { findVoicings, type SearchOptions } from "../theory/search";
import type { Tuning } from "../theory/tuning";
import { strum } from "../audio/pluck";
import { ChordDiagram } from "./ChordDiagram";

interface Props {
  text: string;
  tuning: Tuning | null;
  opts: SearchOptions;
  showDegrees: boolean;
}

/** Voicings shown per row before the strip gets silly. */
const PER_ROW = 14;

export function ProgressionView({ text, tuning, opts, showDegrees }: Props) {
  const entries = useMemo(() => parseProgression(text), [text]);

  const rows = useMemo(() => {
    if (!tuning) return [];
    return entries.map((entry) => ({
      entry,
      result: entry.spec
        ? findVoicings(entry.spec, tuning, { ...opts, maxResults: PER_ROW })
        : null,
    }));
  }, [entries, tuning, opts]);

  return (
    <div className="progression">
      {rows.map(({ entry, result }, i) => (
        <section className="prog-row" key={`${entry.text}-${i}`}>
          <div className="prog-head">
            <h3 className="prog-symbol">{entry.spec?.symbol ?? entry.text}</h3>
            {entry.spec && (
              <div className="prog-tones">
                {entry.spec.tones.map((t) => (
                  <span key={t.degree} className={`mini-tone role-${t.role}`}>
                    {t.noteName}
                    <em>{t.label}</em>
                  </span>
                ))}
              </div>
            )}
            {result && !result.emptyHint && (
              <span className="prog-count">{result.voicings.length} shapes</span>
            )}
          </div>

          {entry.error && <p className="error">{entry.error}</p>}
          {result?.emptyHint && <p className="empty small">{result.emptyHint}</p>}

          {result && result.voicings.length > 0 && (
            <div className="strip" role="list">
              {result.voicings.map((v) => (
                <article className="card strip-card" key={v.id} role="listitem">
                  <div className="card-top">
                    <span className="mono frets">
                      {v.frets.map((f) => (f === null ? "x" : f)).join(" ")}
                    </span>
                    <button
                      type="button"
                      className="play"
                      onClick={() => strum(v.notes.map((n) => n.midi))}
                      aria-label={`Play ${entry.spec?.symbol ?? entry.text}`}
                    >
                      ▶
                    </button>
                  </div>

                  {tuning && <ChordDiagram voicing={v} tuning={tuning} showDegrees={showDegrees} />}

                  <div className="badges">
                    {v.omitted.map((o) => {
                      const rule = result.rules.find((r) => r.tone.degree === o.tone.degree);
                      return (
                        <span
                          className="badge omit"
                          key={o.tone.degree}
                          title={rule?.explanation ?? ""}
                        >
                          omits {o.label}
                          {rule?.reason && <em> · {OMISSION_LABELS[rule.reason]}</em>}
                        </span>
                      );
                    })}
                    {v.omitted.length === 0 && <span className="badge complete">all tones</span>}
                    {v.flags
                      .filter((f) => f.kind === "warn" || f.text === "All strings")
                      .map((f) => (
                        <span className={`badge ${f.kind}`} key={f.text}>
                          {f.text}
                        </span>
                      ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ))}

      {rows.length === 0 && <p className="empty">Type some chords above to get started.</p>}
    </div>
  );
}
