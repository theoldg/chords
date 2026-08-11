# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

| command | what it does |
| --- | --- |
| `./start` | dev server (`vite`) on :5173, installs deps on first run |
| `./start host` | same, exposed on the LAN |
| `./start build` / `npm run build` | `tsc --noEmit` typecheck **then** `vite build` into `dist/` |
| `npm test` | full vitest suite |
| `npx vitest run tests/theory.test.ts` | one file |
| `npx vitest run -t "reads DADGAD"` | one test by name |
| `npx vitest` | watch mode |
| `npm run icons` | regenerate PWA icons into `public/` from `scripts/make-icons.mjs` |

There is no linter or formatter configured. Typechecking only happens via `npm run build`; `vitest` does not typecheck, so run the build before calling a change done. CI (`.github/workflows`) runs `npm ci && npm test && npm run build` and deploys `dist/` to GitHub Pages on every push to `main`.

## Architecture

A React 19 + Vite static SPA with no backend, no router, and no state library. All the substance is in `src/theory/`, which is pure TypeScript with no React dependency — UI components only render what the engine returns.

The pipeline, in order:

1. **`theory/tuning.ts`** — tuning text → MIDI numbers per string, low to high. Case is semantic: uppercase letters, lowercase `b` for flats, so `Bb` (one string) differs from `BB` (two). A string with no octave digit is placed at the lowest pitch strictly above the previous one.
2. **`theory/chord.ts`** — two entry points that produce the same `ChordSpec`: `buildChord()` from the block-builder UI state, and `parseChordSymbol()` from typed text (`parseProgression()` maps over a list). A `ChordSpec` is a root plus `Tone`s, where a tone is a *degree + alteration + role*, not a bare pitch class — the role is what later decides whether it may be dropped.
3. **`theory/rules.ts`** — `analyseTones()` turns each tone into a `ToneRule`: required or not, an omission cost, and a human explanation. This is the domain core; see below.
4. **`theory/search.ts`** — exhaustive DFS over candidate frets per string (`walk`), then `evaluate()` scores each complete shape. **Lower score is better.** Returns the top `maxResults` sorted ascending.

`ui/App.tsx` owns all state (tuning text, mode, builder state, `SearchOptions`) and recomputes via `useMemo`; `ChordBuilder`/`ChordDiagram`/`ProgressionView` are presentational. `audio/pluck.ts` is a self-contained Karplus-Strong synth over WebAudio.

### Two rules that shape everything

**Omission rules are hand-encoded, deliberately.** Public chord databases are collections of *shapes*, not reasoning, so they can't say why a shape is legal or what it dropped. `rules.ts` encodes the pedagogy (Levine's guide tones and rootless voicings, Ted Greene on what to drop with four fingers, Berklee low-interval limits) explicitly so that **every omission carries its reason through to the UI**. Preserve that: a new constraint should surface as an `OmissionReason`/`explanation`/`Flag`, not as a silent filter.

**The hand model is calibrated, not guessed.** `computeHand()` and `handAwkwardness()` in `search.ts` are tuned against the 2,069 curated fingerings in `@tombatossals/chords-db`, and `tests/fingering-model.test.ts` checks the model against that library directly. The load-bearing beliefs, each with the counterexample that produced it, are documented in comments there:

- One finger may cover a contiguous run at the same fret, so A-shape barres cost two fingers, not four — but laying a finger flat is an *option* (`canLieFlat`), not an obligation. The bar reaches exactly one string past what it presses, and it can lift its tip over that string only if it is at most three strings wide (the library has 52 two-string and 6 three-string overhanging bars, and no four-string ones) and the string isn't open. Otherwise the run costs a finger per string, and past four fingers the shape is rejected. This is why open A is three fingers and `x33332` doesn't exist.
- *Straddling* rather than reach is what makes a shape hurt, and it costs the square of the fret gap: fingers a fret either side of a bar is the ordinary `x32233`, two frets either side is `442244`, which nobody can hold.
- Muting below the bass is routine (0.4 a string, and 3.0 for a third one); muting anywhere else — between two sounding strings or above the top one — is the same deliberate act, costs 3.0, and is gated behind `allowInnerMutes`.
- A note doubled at the identical pitch is worth less than the finger it costs.

Do not adjust a score constant without checking `npm test` — the golden tests in `tests/theory.test.ts` assert real-world shapes (open C, the F barre, Hendrix `E7#9` correctly reporting a dropped 5th) and exist precisely to catch tuning drift.

### Gotchas

- **tonal's dictionary has gaps.** `add11`, `madd11` and any parenthesised form return empty. `parseChordSymbol()` therefore normalises unicode accidentals/symbols, strips `add`/`no` modifiers and the slash bass itself, and only hands the residual base quality to tonal. The block builder bypasses tonal's dictionary entirely and emits intervals directly.
- **`vite.config.ts` uses `base: "./"` on purpose** — the app must work mounted at any path (Pages project site, root domain, `file://`). Don't switch to an absolute base.
- **`public/sw.js` is hand-written**, not generated: network-first for navigations, cache-first for fingerprinted assets. Bump `CACHE` if its precache list changes.
