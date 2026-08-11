import { useEffect, useRef } from "react";
import { TUNING_PRESETS } from "../theory/tuning";

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Open the settings panel, where the tuning can be typed rather than picked. */
  onEdit: () => void;
}

/**
 * The tuning picker that stays out when Settings is folded away.
 *
 * Tuning is the one setting you change *while* using the app — you look up the
 * same chord in DAEGAD and then in standard — whereas fret span and the rest
 * get set once. Burying it behind a disclosure costs two taps every time. So it
 * survives the fold as a single row that scrolls sideways: a wrapping grid of
 * all the presets is taller than the collapsed panel it is meant to summarise,
 * and the point of collapsing was to get that height back.
 *
 * The chips are the same `.chip` as the ones inside the panel, so switching
 * tuning looks like the same act whether the panel is open or shut.
 */
export function TuningRail({ value, onChange, onEdit }: Props) {
  const current = value.trim().toUpperCase();
  const activeIndex = TUNING_PRESETS.findIndex((p) => p.value.toUpperCase() === current);

  const rail = useRef<HTMLDivElement>(null);
  const active = useRef<HTMLButtonElement>(null);

  /*
   * Scroll the selected preset into view. Without this a tuning chosen from the
   * open panel can sit off the right-hand edge once the panel folds, and the
   * rail reads as though nothing were selected at all.
   *
   * Deliberately not `scrollIntoView`: that scrolls every scrollable ancestor,
   * the page included, so a restored 7-string tuning would scroll you past the
   * masthead on load.
   */
  useEffect(() => {
    const el = active.current;
    const box = rail.current;
    if (!el || !box) return;
    const centred = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
    box.scrollTo({ left: Math.max(0, centred), behavior: "auto" });
  }, [activeIndex]);

  return (
    <div className="tuning-rail" ref={rail} role="group" aria-label="Tuning">
      {/* A tuning typed by hand belongs to no preset. It leads the row, marked
          as current, so the rail never misreports what is being played — and
          tapping it goes back to the field where it was typed. */}
      {activeIndex === -1 && current !== "" && (
        <button type="button" className="chip rail-chip on" onClick={onEdit}>
          Custom
          <span className="chip-hint">{current}</span>
        </button>
      )}

      {TUNING_PRESETS.map((p, i) => (
        <button
          key={p.value}
          ref={i === activeIndex ? active : undefined}
          type="button"
          className={`chip ghost rail-chip ${i === activeIndex ? "on" : ""}`}
          aria-pressed={i === activeIndex}
          title={p.note ? `${p.value} — ${p.note}` : p.value}
          onClick={() => onChange(p.value)}
        >
          {p.label}
          {/* Suppressed where the label *is* the tuning, so DADGAD doesn't
              print itself twice. */}
          {p.label.toUpperCase() !== p.value.toUpperCase() && (
            <span className="chip-hint">{p.value}</span>
          )}
        </button>
      ))}
    </div>
  );
}
