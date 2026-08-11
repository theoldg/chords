/**
 * Animating the jump a card makes when you star it.
 *
 * Starring re-sorts the list under the card you just clicked, and without this
 * the click reads as a deletion: in a strip scrolled to the ninth shape, the
 * card you starred is instantly at the far left, off-screen, and what fills its
 * old slot is a different shape. Nothing on screen connects the two.
 *
 * So the card is followed. The list scrolls the minimum needed to keep it in
 * view — for a shape moving to the front, that is the front — and every card
 * that moved, including the ones displaced by it, slides from where it was to
 * where it now is. The scroll is deliberately instantaneous and the motion is
 * carried entirely by the animation: a smooth scroll would run on its own clock
 * beside the cards' and the two would visibly disagree.
 *
 * Only on the way in, though. Unstarring is a discard — you have decided this
 * shape is not the one — and chasing it back down the list would move the view
 * off whatever you turned to instead. It still slides to its ranked place, but
 * the list is pinned exactly where you left it.
 *
 * FLIP (First, Last, Invert, Play): measure before the re-sort, measure after,
 * then animate each card from the difference back to nothing. Keyed by DOM
 * element rather than by shape, which React makes safe — the cards are keyed by
 * voicing, so a card that moves is the same node in a new place.
 */

const DURATION_MS = 320;

/* Out fast, settling slowly: the card should look like it was *taken* to the
   front rather than drifting there. */
const EASING = "cubic-bezier(0.2, 0.75, 0.25, 1)";

function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Call from the click handler, before the state change that re-sorts the list.
 *
 * The measurement has to happen while the old order is still on screen, and the
 * replay one frame later, after React has committed the new one. A click is a
 * discrete event, so the re-render is flushed before the frame callback runs.
 *
 * `follow` scrolls the list to keep this card in view. Pass it only when the
 * card is being promoted; see the note above.
 */
export function animateReorder(card: HTMLElement | null, follow: boolean): void {
  const container = card?.parentElement;
  if (!card || !container) return;

  const before = new Map<HTMLElement, DOMRect>();
  for (const el of container.children) {
    if (el instanceof HTMLElement) before.set(el, el.getBoundingClientRect());
  }
  const scrollLeft = container.scrollLeft;
  const scrollTop = container.scrollTop;

  requestAnimationFrame(() => {
    if (!card.isConnected) return;
    if (follow) {
      // "nearest" on both axes: scroll only as far as it takes to show the
      // card, which leaves a list that was already showing it alone.
      card.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    } else {
      /*
       * Staying put is not the same as doing nothing. The strips snap, and a
       * snapped container re-targets the element it was snapped to after a
       * layout change — so letting go of the scroll meant the container
       * chasing the card you had just discarded down the list, which is the
       * one thing this branch exists to avoid. Put the offset back and hold
       * snapping off until the cards have finished moving; by then the
       * container is on a card boundary again and snapping has nothing to
       * correct.
       */
      container.style.scrollSnapType = "none";
      container.scrollLeft = scrollLeft;
      container.scrollTop = scrollTop;
      globalThis.setTimeout(() => {
        container.style.removeProperty("scroll-snap-type");
      }, DURATION_MS);
    }
    if (prefersReducedMotion()) return;

    for (const [el, first] of before) {
      if (!el.isConnected) continue;
      const last = el.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (dx === 0 && dy === 0) continue;
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        { duration: DURATION_MS, easing: EASING },
      );
    }
  });
}
