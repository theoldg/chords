import { useEffect, useMemo, useRef } from "react";
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

  /*
   * Send every strip back to its first shape when the search that filled it
   * changes — a retuning, or any constraint that re-runs it.
   *
   * A strip keeps its scroll offset across a re-render, and both of those
   * inputs replace the shapes in it with a different set in a different order.
   * Being left at card nine then means landing in the middle of voicings you
   * have not seen, with the best-ranked ones off to the left where nothing
   * suggests they exist. The strips are ranked lists, and a new list starts at
   * the top.
   *
   * Editing the progression is not in here because it needs nothing: a row
   * whose chord changed is a different row, keyed differently, and mounts
   * scrolled to the start already.
   */
  const strips = useRef(new Map<number, HTMLDivElement>());
  useEffect(() => {
    for (const el of strips.current.values()) el.scrollLeft = 0;
  }, [tuning, opts]);

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
            <div
              className="strip"
              role="list"
              ref={(el) => {
                if (el) strips.current.set(i, el);
                else strips.current.delete(i);
              }}
            >
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
