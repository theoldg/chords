import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Voicing } from "../theory/search";
import type { Tuning } from "../theory/tuning";
import { usePersistent } from "./settings";

/**
 * Starred shapes, remembered across visits.
 *
 * A favourite is not a collection you go and visit — there is no library tab,
 * and adding one is meant to cost a single click and no thought. It only
 * changes the order of the shapes you already asked for: star the voicing you
 * settled on, and the next time you look up that chord in that tuning it is the
 * first card rather than the ninth.
 *
 * That makes the identity of a favourite a triple — tuning, chord, shape — and
 * all three have to be in the key. The same frets are a different grip in DADGAD
 * than in standard, and `x-3-2-0-1-0` is C in one chord search and nothing at
 * all in the next.
 *
 * The tuning is keyed by its pitches rather than by the text that produced them,
 * so `EADGBE` and `E2A2D3G3B3E4` are one tuning, which is what a player means.
 */

/** How many stars are kept. Old ones fall off the end; see `toggleFavourite`. */
const MAX_FAVOURITES = 400;

const KEY_SEPARATOR = "|";

export type FavouriteKey = string;

export function favouriteKey(tuning: Tuning, symbol: string, voicingId: string): FavouriteKey {
  return [tuning.strings.map((s) => s.midi).join(","), symbol, voicingId].join(KEY_SEPARATOR);
}

/** A stored list is only as trustworthy as anything else in localStorage: keep
 *  the strings, drop everything else, and cap the length. */
export function reviveFavourites(raw: unknown): FavouriteKey[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((k): k is string => typeof k === "string" && k.length <= 200).slice(0, MAX_FAVOURITES);
}

export interface Favourites {
  has: (key: FavouriteKey) => boolean;
  toggle: (key: FavouriteKey) => void;
}

export function useFavourites(): Favourites {
  const [keys, setKeys] = usePersistent<FavouriteKey[]>("favourites", [], reviveFavourites);

  return {
    // A list rather than a Set because it has to survive JSON, and it is short
    // enough that membership by scan costs nothing next to the search itself.
    has: useCallback((key: FavouriteKey) => keys.includes(key), [keys]),
    toggle: useCallback((key: FavouriteKey) => toggleFavourite(setKeys, key), [setKeys]),
  };
}

function toggleFavourite(
  setKeys: Dispatch<SetStateAction<FavouriteKey[]>>,
  key: FavouriteKey,
): void {
  setKeys((current) =>
    current.includes(key)
      ? current.filter((k) => k !== key)
      : // Newest first, so that the cap discards the shape you starred longest
        // ago rather than the one you starred a second ago.
        [key, ...current].slice(0, MAX_FAVOURITES),
  );
}

/**
 * The starred shapes of this search, moved to the front.
 *
 * A stable partition, not a re-score: within the starred group and within the
 * rest, the engine's ranking is left exactly as it was. A star says "this one
 * first for me", which is a different claim from the ranking's "this one is
 * easiest to play", and it should not disturb it.
 *
 * Returns the original array when nothing is starred, so the common case
 * re-renders nothing.
 */
export function starredFirst(
  voicings: Voicing[],
  tuning: Tuning,
  symbol: string,
  favourites: Favourites,
): Voicing[] {
  const starred = voicings.filter((v) => favourites.has(favouriteKey(tuning, symbol, v.id)));
  if (starred.length === 0 || starred.length === voicings.length) return voicings;
  return [...starred, ...voicings.filter((v) => !starred.includes(v))];
}
