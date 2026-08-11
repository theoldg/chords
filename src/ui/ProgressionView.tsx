import { useMemo } from "react";
import { parseProgression } from "../theory/chord";
import { findVoicings, type SearchOptions } from "../theory/search";
import type { Tuning } from "../theory/tuning";
import { VoicingCard } from "./VoicingCard";

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
                {entry.spec.addedBass && (
                  <span className="mini-tone role-bass">
                    {entry.spec.addedBass.noteName}
                    <em>bass</em>
                  </span>
                )}
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
              {tuning &&
                result.voicings.map((v) => (
                  <VoicingCard
                    key={v.id}
                    voicing={v}
                    tuning={tuning}
                    rules={result.rules}
                    showDegrees={showDegrees}
                    playLabel={`Play ${entry.spec?.symbol ?? entry.text}`}
                    className="strip-card"
                    role="listitem"
                  />
                ))}
            </div>
          )}
        </section>
      ))}

      {rows.length === 0 && <p className="empty">Type some chords above to get started.</p>}
    </div>
  );
}
