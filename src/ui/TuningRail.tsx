import { useLayoutEffect, useRef } from "react";
import { TUNING_PRESETS } from "../theory/tuning";

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Whether the settings panel is unfolded. */
  open: boolean;
  /** Open the settings panel, where the tuning can be typed rather than picked. */
  onEdit: () => void;
}

/** Motion constants, read from the stylesheet so the fold has one definition. */
function foldMotion() {
  const s = getComputedStyle(document.documentElement);
  const ms = parseFloat(s.getPropertyValue("--fold")) || 260;
  const easing = s.getPropertyValue("--ease-fold").trim() || "ease";
  return { duration: ms, easing };
}

function rects(els: HTMLElement[]) {
  return els.map((el) => el.getBoundingClientRect());
}

/**
 * The tuning picker: one set of chips in both of the panel's states.
 *
 * Tuning is the one setting you change *while* using the app — you look up the
 * same chord in DAEGAD and then in standard — whereas fret span and the rest
 * get set once. Burying it behind a disclosure costs two taps every time. So it
 * survives the fold as a single row that scrolls sideways, and when the panel
 * opens that same row wraps into the full grid: a wrapping grid is taller than
 * the collapsed panel it is meant to summarise, and the point of collapsing was
 * to get that height back.
 *
 * The two states used to be two separate lists — a rail that squashed away and
 * a grid that grew in its place — which crossfaded one copy of a chip into
 * another copy of itself. Sharing the elements means the chips simply travel to
 * where they are going: on a wide screen the first row barely moves at all and
 * the panel just grows underneath it.
 */
export function TuningRail({ value, onChange, open, onEdit }: Props) {
  const current = value.trim().toUpperCase();
  const activeIndex = TUNING_PRESETS.findIndex((p) => p.value.toUpperCase() === current);

  const fold = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const active = useRef<HTMLButtonElement>(null);
  /* Where the rail was scrolled to when it was last a scrolling row. Kept here
     rather than read off the element at animation time: by then the element has
     already been re-laid-out as a wrapping grid, which has no overflow to
     scroll and so reports 0. */
  const scrolled = useRef(0);
  const wasOpen = useRef(open);

  /*
   * Scroll the selected preset into view. Without this a tuning chosen from the
   * open panel can sit off the right-hand edge once the panel folds, and the
   * rail reads as though nothing were selected at all.
   *
   * Deliberately not `scrollIntoView`: that scrolls every scrollable ancestor,
   * the page included, so a restored 7-string tuning would scroll you past the
   * masthead on load.
   */
  function centre(behavior: ScrollBehavior = "auto") {
    const el = active.current;
    const box = rail.current;
    if (!el || !box) return;
    const centred = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
    const target = Math.max(0, centred);
    box.scrollTo({ left: target, behavior });
    scrolled.current = target;
  }

  useLayoutEffect(() => {
    const box = fold.current;
    const railEl = rail.current;
    if (!box || !railEl) return;

    const toggled = wasOpen.current !== open;
    wasOpen.current = open;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!toggled || reduced) {
      // A tuning picked from the already-collapsed rail scrolls it over, rather
      // than snapping — the fold-toggle case below stays instant, since it is
      // part of the FLIP measurement the chips animate against.
      if (!open) centre(reduced ? "auto" : "smooth");
      return;
    }

    /*
     * FLIP, with the "first" half measured by putting the panel back into the
     * state it just left for the length of one synchronous block. The usual
     * trick — caching rectangles after every commit — measures the wrong thing
     * here, because the rail can be scrolled sideways between the last commit
     * and the tap that opens the panel.
     */
    const chips = Array.from(railEl.querySelectorAll<HTMLElement>(".rail-chip"));

    railEl.classList.toggle("wrapped", !open);
    box.classList.toggle("open", !open);
    if (open) railEl.scrollLeft = scrolled.current; // the row, where the user left it
    const beforeHeight = box.getBoundingClientRect().height;
    const before = rects(chips);

    railEl.classList.toggle("wrapped", open);
    box.classList.toggle("open", open);
    if (!open) centre();
    const afterHeight = box.getBoundingClientRect().height;
    const after = rects(chips);

    const { duration, easing } = foldMotion();
    chips.forEach((chip, i) => {
      const dx = before[i].left - after[i].left;
      const dy = before[i].top - after[i].top;
      if (!dx && !dy) return;
      chip.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration, easing },
      );
    });
    /* The box moves once, under the same curve, so the settings body below it
       doesn't get a second, differently-timed shove. */
    if (beforeHeight !== afterHeight) {
      box.animate([{ height: `${beforeHeight}px` }, { height: `${afterHeight}px` }], {
        duration,
        easing,
      });
    }
  }, [open, activeIndex]);

  return (
    <div className={`rail-fold ${open ? "open" : ""}`} ref={fold}>
      {/* Only labelled once the panel is open; folded away, the row is the
          panel's summary and a heading over it would be noise. */}
      <h3 className="settings-head rail-head">Tuning</h3>
      <div
        className={`tuning-rail ${open ? "wrapped" : ""}`}
        ref={rail}
        role="group"
        aria-label="Tuning"
        onScroll={(e) => {
          if (!open) scrolled.current = e.currentTarget.scrollLeft;
        }}
      >
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
    </div>
  );
}
