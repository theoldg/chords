# Chord Shapes

> Disclaimer: This is 100% vibe-coded to test the capacities of Claude and for fun.

Find guitar fingerings for any chord in any tuning — and get an honest account
of which chord tones each shape leaves out.

```
./start
```

That's it. It installs dependencies on first run, starts the app, and opens a
browser at http://localhost:5173.

| command | what it does |
| --- | --- |
| `./start` | dev server with hot reload |
| `./start host` | same, reachable from your phone on the same wifi |
| `./start build` | static site in `dist/` — drop it on any host |
| `./start preview` | build, then serve the built site |
| `npm test` | run the theory test suite |
| `npm run icons` | regenerate the PWA icons from `scripts/make-icons.mjs` |

## Installing it on a phone

It's a PWA, so it installs from the browser with no app store involved. Open the
deployed site in Chrome on Android and use **⋮ → Add to Home screen** (Chrome
usually offers an install prompt on its own); on iOS use Safari's **Share → Add
to Home Screen**. It then launches without browser chrome, and a service worker
caches the app so it keeps working with no signal — which is the point, since
you practise where the wifi isn't.

Icons are generated, not hand-drawn: `scripts/make-icons.mjs` rasterises the
chord-diagram mark straight to PNG using only Node's zlib, so there's no image
dependency and the favicon and app icons can't drift apart. It emits the 192
and 512 sizes Chrome needs, a maskable variant with the art inside Android's
safe zone, and an apple-touch-icon.

## What it does

Two modes, sharing one tuning and one set of constraints.

**One chord** — pick a tuning (presets, or type `DAEGAD`), build a chord out of
blocks (root, quality, 6th/7th, extensions, alterations) and get ranked,
playable fingerings. Each is labelled with what it omits and why: **"omits the
5th · 5th is expendable"**.

**Progression** — paste or type a list of chord symbols, separated by spaces,
commas, bar lines or newlines. You get one horizontally scrolling row of
fingerings per chord, so you can pick a shape for each and see the whole
sequence at once. An unreadable symbol reports itself in place without stopping
the rest of the list.

Ranking favours shapes that ring out across every string, then playability
(span, finger count, barre), then how little the shape drops.

## Where the rules come from

Two layers, with very different sources.

**Chord spelling** is settled theory, so it comes from [tonal](https://github.com/tonaljs/tonal).
One caveat found the hard way: tonal's dictionary has real gaps — `add11`,
`madd11` and every parenthesised form return empty — so `src/theory/chord.ts`
normalises the text and handles `add`/`no` modifiers itself before handing the
base quality to tonal. The block builder bypasses the dictionary entirely and
emits intervals directly.

**Omission and voicing rules** have no authoritative machine-readable source.
The chord databases on the web are collections of *shapes*, not of reasoning, so
they can't tell you why a shape is legal or what it dropped. They're encoded
explicitly in `src/theory/rules.ts` from the standard pedagogy:

- **Mark Levine, _The Jazz Theory Book_** — guide tones (the 3rd and 7th carry
  the chord quality), rootless voicings, the 5th as the first tone to go.
- **Ted Greene, _Chord Chemistry_** — the guitar canon on what to drop when you
  only have four fingers.
- **Berklee arranging practice** — low interval limits (below ~Bb2 a major 3rd
  turns to mud), and the natural 11 as an avoid note over a major 3rd.

Which reduces to a priority order plus hard constraints:

| tone | status |
| --- | --- |
| 3rd, or the 2/4 that replaces it in a sus chord | required — defines the quality |
| 6th / 7th | required — guide tone |
| any **altered** tone (b5, #5, b9, #9, #11, b13) | required — it's why the chord has that name |
| the **highest named extension** (the 11 in `Gm(add11)`) | required — it's literally in the name |
| perfect 5th | **first to drop** — unless altered, or structural as in dim7/m7b5 |
| root | droppable only with "a bassist has the root" enabled |
| 9th or 11th sitting under a 13th | filler, routinely dropped |

Every omission carries its reason through to the UI, which is the whole point of
encoding rules instead of shipping a shape library.

## Layout

```
src/theory/tuning.ts   tuning text -> MIDI notes per string
src/theory/chord.ts    block builder + text parser -> chord tones with roles
src/theory/rules.ts    what may be dropped, and why
src/theory/search.ts   fingering search, hand feasibility, ranking
src/ui/                builder, chord diagrams, progression rows, controls
src/audio/pluck.ts     Karplus-Strong so you can hear a voicing
tests/theory.test.ts   golden tests in standard tuning
```

The golden tests are the real safety net: if the engine can't produce the open C,
the F barre, and the Hendrix `E7#9` — and correctly report that the Hendrix shape
drops the 5th — the rules are wrong.

## Tuning input

Uppercase note letters, lowercase `b` for flats: `EbADGBE`. That convention is
what makes `Bb` (one flat string) distinguishable from `BB` (two B strings).
Add a digit to pin an octave (`D2A2E3G3A3D4`); otherwise each string is placed
at the lowest pitch above the previous one.
