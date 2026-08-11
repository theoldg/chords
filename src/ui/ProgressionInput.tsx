import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { parseProgression, type ProgressionEntry } from "../theory/chord";

interface Props {
  value: string;
  onChange: (next: string) => void;
}

/**
 * The progression field, with the symbols it cannot read marked where they were
 * typed.
 *
 * A chord that fails to parse used to announce itself only in the results far
 * below, so a typo read as "this app doesn't know that chord" rather than as
 * "you left a bracket open". The mark is a red wavy underline under the offending
 * symbol plus one line naming them under the field.
 *
 * The underline is drawn by a backdrop: a div holding the same text in the same
 * metrics, sitting exactly under the textarea, its text transparent so only the
 * decoration shows through from behind the real (opaque) glyphs. Anything that
 * changes the font, padding or wrapping has to change for both — hence one
 * shared `.text-area` class with the backdrop only turning off what it must.
 */
export function ProgressionInput({ value, onChange }: Props) {
  const entries = useMemo(() => parseProgression(value), [value]);

  /*
   * Where the cursor is, so a half-typed symbol is not called wrong while you
   * are still typing it: "Cmaj" is on its way to "Cmaj7". Null while the field
   * is not focused, which is exactly when every symbol is fair game.
   */
  const [caret, setCaret] = useState<number | null>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Grows the field to fit its content instead of scrolling internally: reset
  // to nothing first so it can shrink back down when a line is deleted, not
  // just grow.
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const flagged = useMemo(() => {
    const underCaret = (e: ProgressionEntry) =>
      caret !== null && caret >= e.start && caret <= e.end;
    return entries.filter((e) => !e.spec && !underCaret(e));
  }, [entries, caret]);

  // Alternating runs of plain text and unreadable symbol, in input order.
  const segments = useMemo(() => {
    const out: { text: string; bad: boolean }[] = [];
    let at = 0;
    for (const e of flagged) {
      if (e.start > at) out.push({ text: value.slice(at, e.start), bad: false });
      out.push({ text: value.slice(e.start, e.end), bad: true });
      at = e.end;
    }
    out.push({ text: value.slice(at), bad: false });
    return out;
  }, [flagged, value]);

  const names = [...new Set(flagged.map((e) => e.text))];

  return (
    <>
      {/* Only the field and its backdrop live in the positioned box: the box is
          what the backdrop stretches to, so the message below has to sit
          outside it. */}
      <div className="prog-input">
        <div className="text-area mono text-backdrop" ref={backdrop} aria-hidden="true">
          {segments.map((s, i) =>
            s.bad ? (
              <span className="unreadable" key={i}>
                {s.text}
              </span>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )}
          {/* A trailing newline collapses in a div but not in a textarea;
              without this the backdrop scrolls a line short of the field. */}
          {"\n"}
        </div>

        <textarea
          className="text-area mono"
          ref={textarea}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setCaret(e.target.selectionStart);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onFocus={(e) => setCaret(e.currentTarget.selectionStart)}
          onBlur={() => setCaret(null)}
          onScroll={(e) => {
            if (backdrop.current) backdrop.current.scrollTop = e.currentTarget.scrollTop;
          }}
          rows={2}
          spellCheck={false}
          placeholder="Am7  D7  Gmaj7  Cmaj7"
          aria-label="Chord progression"
          aria-invalid={names.length > 0}
        />
      </div>

      {names.length > 0 && (
        <p className="error">
          Not a chord I can read:{" "}
          {names.map((n, i) => (
            <span key={n}>
              {i > 0 && ", "}
              <code>{n}</code>
            </span>
          ))}
        </p>
      )}
    </>
  );
}
