import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  DEFAULT_BUILDER,
  ROOT_CHOICES,
  type Alteration,
  type ChordBuilderState,
  type ExtensionMode,
  type Seventh,
  type Triad,
} from "../theory/chord";
import { DEFAULT_SEARCH_OPTIONS, type SearchOptions } from "../theory/search";

/**
 * Settings that survive a reload.
 *
 * The app has no backend and no account, so localStorage is the whole of its
 * memory: the tuning you play in, the constraints your hand actually obeys and
 * the chords you were working on are all things you set once and would resent
 * setting again on every visit.
 *
 * Everything read back out is treated as hostile. Stored values may have been
 * written by an older build, hand-edited in devtools, or truncated by a browser
 * clearing space — and a bad value here does not degrade gracefully, it reaches
 * `buildChord()` or the search and throws on a lookup that returns undefined.
 * So every key has a *reviver* that either returns a value known to be legal or
 * returns null, and null means "use the default". Nothing is trusted because it
 * happened to be the right JSON type.
 *
 * The key prefix carries a version. Bumping it abandons every stored value
 * rather than migrating it, which is the right trade for preferences that take
 * seconds to set again.
 */

const PREFIX = "chord-shapes:v1:";

/** localStorage access that cannot throw: Safari's private mode, a blocked
 *  third-party context, and a full quota all raise rather than return null. */
function readRaw(key: string): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeRaw(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* Persisting is a courtesy; failing to persist must never break a keystroke. */
  }
}

/**
 * `useState`, but seeded from localStorage and written back on every change.
 *
 * The write is an effect rather than part of the setter so that it also covers
 * state changed by any other route, and so a render never has a side effect.
 */
export function usePersistent<T>(
  key: string,
  fallback: T,
  revive: (raw: unknown) => T | null,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const raw = readRaw(key);
    if (raw === undefined) return fallback;
    return revive(raw) ?? fallback;
  });

  useEffect(() => {
    writeRaw(key, value);
  }, [key, value]);

  return [value, setValue];
}

// ---------------------------------------------------------------------------
// Revivers
// ---------------------------------------------------------------------------

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

/**
 * Free text, capped. The cap is not about storage — it stops a pathological
 * stored value (a pasted document under the progression key) from being fed to
 * the parser on every load.
 */
export const asText =
  (maxLength: number) =>
  (raw: unknown): string | null =>
    typeof raw === "string" && raw.length <= maxLength ? raw : null;

export const asBoolean = (raw: unknown): boolean | null =>
  typeof raw === "boolean" ? raw : null;

export const asOneOf =
  <T extends string>(allowed: readonly T[]) =>
  (raw: unknown): T | null =>
    typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;

/**
 * The keys of an exhaustive record, as a list.
 *
 * Written this way so that adding a variant to `Triad` (or `Seventh`, or
 * `Alteration`) fails the typecheck here instead of silently making the new
 * value unrestorable — the reviver would quietly reject it and the setting
 * would appear not to persist.
 */
function variantsOf<T extends string>(record: Record<T, true>): readonly T[] {
  return Object.keys(record) as T[];
}

const TRIADS = variantsOf<Triad>({
  maj: true,
  min: true,
  dim: true,
  aug: true,
  sus2: true,
  sus4: true,
  five: true,
});

const SEVENTHS = variantsOf<Seventh>({ none: true, "6": true, b7: true, maj7: true });

const EXT_MODES = variantsOf<ExtensionMode>({ off: true, on: true, add: true });

const ALTERATIONS = variantsOf<Alteration>({
  b5: true,
  "#5": true,
  b9: true,
  "#9": true,
  "#11": true,
  b13: true,
});

/**
 * Bounds for the numeric constraints, shared by the sliders that set them and
 * by the reviver that validates them, so a stored value can never sit outside
 * the range its own control offers.
 */
export const OPTION_LIMITS = {
  maxSpan: { min: 2, max: 6 },
  maxFret: { min: 4, max: 20 },
  minSoundingStrings: { min: 2, max: 6 },
} as const;

type LimitedOption = keyof typeof OPTION_LIMITS;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Only the options the UI exposes are restored; `maxResults` and
 * `collapseMuteVariants` are engine knobs, and taking those from storage would
 * let a stale value change results with nothing on screen to explain it.
 */
export function reviveOptions(raw: unknown): SearchOptions | null {
  if (!isRecord(raw)) return null;
  const opts: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS };

  for (const key of Object.keys(OPTION_LIMITS) as LimitedOption[]) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      const { min, max } = OPTION_LIMITS[key];
      opts[key] = clamp(Math.round(value), min, max);
    }
  }
  for (const key of ["allowRootOmission", "allowInnerMutes"] as const) {
    if (typeof raw[key] === "boolean") opts[key] = raw[key];
  }
  return opts;
}

/** Field by field: anything unrecognised falls back to that field's default,
 *  so one bad key doesn't discard a chord you spent a minute assembling. */
export function reviveBuilder(raw: unknown): ChordBuilderState | null {
  if (!isRecord(raw)) return null;
  const roots = ROOT_CHOICES as readonly string[];
  const bass = raw.bass;

  return {
    root: asOneOf(roots)(raw.root) ?? DEFAULT_BUILDER.root,
    triad: asOneOf(TRIADS)(raw.triad) ?? DEFAULT_BUILDER.triad,
    seventh: asOneOf(SEVENTHS)(raw.seventh) ?? DEFAULT_BUILDER.seventh,
    ext9: asOneOf(EXT_MODES)(raw.ext9) ?? DEFAULT_BUILDER.ext9,
    ext11: asOneOf(EXT_MODES)(raw.ext11) ?? DEFAULT_BUILDER.ext11,
    ext13: asOneOf(EXT_MODES)(raw.ext13) ?? DEFAULT_BUILDER.ext13,
    alterations: Array.isArray(raw.alterations)
      ? raw.alterations.filter((a): a is Alteration => asOneOf(ALTERATIONS)(a) !== null)
      : DEFAULT_BUILDER.alterations,
    // null is a meaningful value here (no slash bass), so it has to survive the
    // round trip rather than being read as "missing" and replaced by a default.
    bass: bass === null ? null : (asOneOf(roots)(bass) ?? DEFAULT_BUILDER.bass),
  };
}
