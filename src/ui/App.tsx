import { useMemo } from "react";
import { DEFAULT_BUILDER, buildChord, type ChordSpec } from "../theory/chord";
import { DEFAULT_SEARCH_OPTIONS, findVoicings, type SearchOptions } from "../theory/search";
import { TUNING_PRESETS, parseTuning } from "../theory/tuning";
import { ChordBuilder } from "./ChordBuilder";
import { ProgressionView } from "./ProgressionView";
import {
  OPTION_LIMITS,
  asBoolean,
  asOneOf,
  asText,
  reviveBuilder,
  reviveOptions,
  usePersistent,
} from "./settings";
import { TuningRail } from "./TuningRail";
import { VoicingCard } from "./VoicingCard";

/** The two ways of naming what you want: type it (one or several), or build it. */
type Mode = "progression" | "blocks";
const MODES = ["progression", "blocks"] as const satisfies readonly Mode[];

export function App() {
  // Every one of these is remembered across visits; see ./settings.ts for what
  // a stored value has to look like to be trusted.
  const [tuningText, setTuningText] = usePersistent("tuning", "EADGBE", asText(64));
  const [progressionText, setProgressionText] = usePersistent(
    "progression",
    "Am7 D7 Gmaj7 Cmaj7",
    asText(2000),
  );
  const [mode, setMode] = usePersistent<Mode>("mode", "progression", asOneOf(MODES));
  const [builder, setBuilder] = usePersistent("builder", DEFAULT_BUILDER, reviveBuilder);
  const [opts, setOpts] = usePersistent("options", DEFAULT_SEARCH_OPTIONS, reviveOptions);
  const [showDegrees, setShowDegrees] = usePersistent("showDegrees", true, asBoolean);
  const [settingsOpen, setSettingsOpen] = usePersistent("settingsOpen", false, asBoolean);

  const { tuning, error: tuningError } = useMemo(() => parseTuning(tuningText), [tuningText]);

  const builtSpec = useMemo(() => buildChord(builder), [builder]);

  const spec: ChordSpec | null = mode === "blocks" ? builtSpec : null;

  const result = useMemo(() => {
    if (!spec || !tuning) return null;
    return findVoicings(spec, tuning, opts);
  }, [spec, tuning, opts]);

  const setOpt = <K extends keyof SearchOptions>(key: K, value: SearchOptions[K]) =>
    setOpts((o) => ({ ...o, [key]: value }));

  return (
    <div className="app">
      <header className="masthead">
        <h1>Chord Shapes</h1>
        <p>Fingerings for any chord in any tuning.</p>
      </header>

      {/*
        Tuning and constraints are set once and then mostly left alone, so they
        fold away behind a single summary line instead of two standing panels.

        A controlled section rather than <details>, because the collapsed state
        is not empty: the tuning rail has to live outside the summary (a button
        inside a <summary> fights it for the click) while still reading as part
        of the panel.
      */}
      <section className={`panel settings ${settingsOpen ? "open" : ""}`}>
        <button
          type="button"
          className="settings-summary"
          aria-expanded={settingsOpen}
          aria-controls="settings-body"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <span className="settings-title">Settings</span>
          {/* The tuning is missing from the digest on purpose — the rail below
              says it, in a form you can also act on. */}
          <span className="settings-digest mono">
            span {opts.maxSpan} · to fret {opts.maxFret}
          </span>
        </button>

        {!settingsOpen && (
          <TuningRail
            value={tuningText}
            onChange={setTuningText}
            onEdit={() => setSettingsOpen(true)}
          />
        )}

        <div id="settings-body" hidden={!settingsOpen}>
          <h3 className="settings-head">Tuning</h3>
          <div className="chip-row presets">
            {TUNING_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className={`chip ghost ${tuningText.toUpperCase() === p.value.toUpperCase() ? "on" : ""}`}
                onClick={() => setTuningText(p.value)}
                title={p.note}
              >
                {p.label}
                {p.label.toUpperCase() !== p.value.toUpperCase() && (
                  <span className="chip-hint">{p.value}</span>
                )}
              </button>
            ))}
          </div>
          <div className="row">
            <input
              className={`text-input mono ${tuningError ? "bad" : ""}`}
              value={tuningText}
              onChange={(e) => setTuningText(e.target.value)}
              spellCheck={false}
              aria-label="Tuning"
            />
            {tuning && (
              <div className="tuning-readout">
                {tuning.strings.map((s, i) => (
                  <span key={i} className="string-pill">
                    {s.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          {tuningError ? (
            <p className="error">{tuningError}</p>
          ) : (
            <p className="hint">
              Uppercase note letters, lowercase <code>b</code> for flats (<code>EbADGBE</code>). Add
              a digit to pin an octave (<code>D2A2E3G3A3D4</code>). Octaves are otherwise assigned
              ascending from the lowest string.
            </p>
          )}

          <h3 className="settings-head">Constraints</h3>
          <div className="opts">
            <label className="opt">
              <span>
                Fret stretch <b>{opts.maxSpan}</b>
              </span>
              <input
                type="range"
                min={OPTION_LIMITS.maxSpan.min}
                max={OPTION_LIMITS.maxSpan.max}
                value={opts.maxSpan}
                onChange={(e) => setOpt("maxSpan", Number(e.target.value))}
              />
            </label>
            <label className="opt">
              <span>
                Highest fret <b>{opts.maxFret}</b>
              </span>
              <input
                type="range"
                min={OPTION_LIMITS.maxFret.min}
                max={OPTION_LIMITS.maxFret.max}
                value={opts.maxFret}
                onChange={(e) => setOpt("maxFret", Number(e.target.value))}
              />
            </label>
            <label className="opt">
              <span>
                Min. strings <b>{opts.minSoundingStrings}</b>
              </span>
              <input
                type="range"
                min={OPTION_LIMITS.minSoundingStrings.min}
                max={OPTION_LIMITS.minSoundingStrings.max}
                value={opts.minSoundingStrings}
                onChange={(e) => setOpt("minSoundingStrings", Number(e.target.value))}
              />
            </label>
            <label className="opt check">
              <input
                type="checkbox"
                checked={opts.allowRootOmission}
                onChange={(e) => setOpt("allowRootOmission", e.target.checked)}
              />
              <span>
                A bassist has the root
                <small>Unlocks rootless voicings</small>
              </span>
            </label>
            <label className="opt check">
              <input
                type="checkbox"
                checked={opts.allowInnerMutes}
                onChange={(e) => setOpt("allowInnerMutes", e.target.checked)}
              />
              <span>
                Allow skipped strings
                <small>Needs deliberate muting</small>
              </span>
            </label>
            <label className="opt check">
              <input
                type="checkbox"
                checked={showDegrees}
                onChange={(e) => setShowDegrees(e.target.checked)}
              />
              <span>
                Label scale degrees
                <small>R, b3, 11 … on each dot</small>
              </span>
            </label>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>{mode === "progression" ? "Chords" : "Chord"}</h2>
          <div className="seg">
            <button
              type="button"
              className={`seg-btn ${mode === "progression" ? "on" : ""}`}
              onClick={() => setMode("progression")}
            >
              Type
            </button>
            <button
              type="button"
              className={`seg-btn ${mode === "blocks" ? "on" : ""}`}
              onClick={() => setMode("blocks")}
            >
              Build
            </button>
          </div>
        </div>

        {mode === "progression" && (
          <>
            <textarea
              className="text-area mono"
              value={progressionText}
              onChange={(e) => setProgressionText(e.target.value)}
              rows={2}
              spellCheck={false}
              placeholder="Am7  D7  Gmaj7  Cmaj7"
              aria-label="Chord progression"
            />
            <p className="hint">
              One row of fingerings per chord. Separate with spaces, commas, bar lines or new lines —
              paste a chart straight in. Each row scrolls sideways. Understands{" "}
              <code>Gm(add11)</code>, <code>Cmaj7#11</code>, <code>E7#9</code>, <code>C6/9</code>,{" "}
              <code>F7alt</code>, <code>Am7/E</code>, <code>Am/G#</code>, <code>Cno5</code>.
            </p>
          </>
        )}

        {mode === "blocks" && (
          <ChordBuilder state={builder} onChange={setBuilder} symbol={builtSpec.symbol} />
        )}

        {spec && (
          <div className="spec-readout">
            <span className="spec-symbol">{spec.symbol}</span>
            <span className="spec-notes">
              {spec.tones.map((t) => (
                <span key={t.degree} className={`tone-pill role-${t.role}`}>
                  <b>{t.noteName}</b>
                  <span>{t.label}</span>
                </span>
              ))}
              {spec.addedBass && (
                <span className="tone-pill role-bass" title="Slash bass from outside the chord">
                  <b>{spec.addedBass.noteName}</b>
                  <span>bass</span>
                </span>
              )}
            </span>
          </div>
        )}

        {spec?.warnings.map((w) => (
          <p className="warning" key={w}>
            {w}
          </p>
        ))}
      </section>

      {mode === "progression" && (
        <ProgressionView
          text={progressionText}
          tuning={tuning}
          opts={opts}
          showDegrees={showDegrees}
        />
      )}

      {result && spec && (
        <>
          <section className="results">
            <div className="results-head">
              <h2>
                {result.voicings.length} shape{result.voicings.length === 1 ? "" : "s"} for{" "}
                <span className="mono">{spec.symbol}</span> in{" "}
                <span className="mono">{tuningText.toUpperCase()}</span>
              </h2>
              <span className="hint">Best-ranked first — playability, bass note, and how little it drops.</span>
            </div>

            {result.emptyHint && <p className="empty">{result.emptyHint}</p>}

            <div className="grid">
              {tuning &&
                result.voicings.map((v) => (
                  <VoicingCard
                    key={v.id}
                    voicing={v}
                    tuning={tuning}
                    rules={result.rules}
                    showDegrees={showDegrees}
                    playLabel={`Play ${spec.symbol}`}
                  />
                ))}
            </div>
          </section>
        </>
      )}

      <footer className="foot">
        <p>
          Omission rules encoded from Levine’s <i>Jazz Theory Book</i> (guide tones, rootless
          voicings), Ted Greene’s <i>Chord Chemistry</i>, and Berklee arranging practice (low
          interval limits, the natural 11 as an avoid note over a major 3rd). Chord spellings via{" "}
          <code>tonal</code>.
        </p>
      </footer>
    </div>
  );
}
