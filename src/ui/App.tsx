import { useMemo, useState } from "react";
import {
  DEFAULT_BUILDER,
  buildChord,
  parseChordSymbol,
  type ChordBuilderState,
  type ChordSpec,
} from "../theory/chord";
import { OMISSION_LABELS } from "../theory/rules";
import { DEFAULT_SEARCH_OPTIONS, findVoicings, type SearchOptions } from "../theory/search";
import { TUNING_PRESETS, parseTuning } from "../theory/tuning";
import { strum } from "../audio/pluck";
import { ChordBuilder } from "./ChordBuilder";
import { ChordDiagram } from "./ChordDiagram";

type Mode = "blocks" | "text";

export function App() {
  const [tuningText, setTuningText] = useState("DAEGAD");
  const [mode, setMode] = useState<Mode>("blocks");
  const [builder, setBuilder] = useState<ChordBuilderState>(DEFAULT_BUILDER);
  const [chordText, setChordText] = useState("Gm(add11)");
  const [opts, setOpts] = useState<SearchOptions>(DEFAULT_SEARCH_OPTIONS);
  const [showDegrees, setShowDegrees] = useState(true);

  const { tuning, error: tuningError } = useMemo(() => parseTuning(tuningText), [tuningText]);

  const builtSpec = useMemo(() => buildChord(builder), [builder]);
  const parsed = useMemo(() => parseChordSymbol(chordText), [chordText]);

  const spec: ChordSpec | null = mode === "blocks" ? builtSpec : parsed.spec;
  const chordError = mode === "text" ? parsed.error : null;

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
        <p>
          Fingerings for any chord in any tuning — and an honest account of which notes each shape
          leaves out.
        </p>
      </header>

      <section className="panel">
        <h2>1. Tuning</h2>
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
              <span className="chip-hint">{p.value}</span>
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
            Uppercase note letters, lowercase <code>b</code> for flats (<code>EbADGBE</code>). Add a
            digit to pin an octave (<code>D2A2E3G3A3D4</code>). Octaves are otherwise assigned
            ascending from the lowest string.
          </p>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>2. Chord</h2>
          <div className="seg">
            <button
              type="button"
              className={`seg-btn ${mode === "blocks" ? "on" : ""}`}
              onClick={() => setMode("blocks")}
            >
              Blocks
            </button>
            <button
              type="button"
              className={`seg-btn ${mode === "text" ? "on" : ""}`}
              onClick={() => setMode("text")}
            >
              Type it
            </button>
          </div>
        </div>

        {mode === "blocks" ? (
          <ChordBuilder state={builder} onChange={setBuilder} symbol={builtSpec.symbol} />
        ) : (
          <div className="text-mode">
            <input
              className={`text-input big mono ${chordError ? "bad" : ""}`}
              value={chordText}
              onChange={(e) => setChordText(e.target.value)}
              spellCheck={false}
              aria-label="Chord symbol"
            />
            {chordError ? (
              <p className="error">{chordError}</p>
            ) : (
              <p className="hint">
                Understands <code>Gm(add11)</code>, <code>Cmaj7#11</code>, <code>E7#9</code>,{" "}
                <code>C6/9</code>, <code>F7alt</code>, <code>Am7/E</code>, <code>Cno5</code>.
              </p>
            )}
          </div>
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
            </span>
          </div>
        )}

        {spec?.warnings.map((w) => (
          <p className="warning" key={w}>
            {w}
          </p>
        ))}
      </section>

      <section className="panel">
        <h2>3. Constraints</h2>
        <div className="opts">
          <label className="opt">
            <span>
              Fret stretch <b>{opts.maxSpan}</b>
            </span>
            <input
              type="range"
              min={2}
              max={6}
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
              min={4}
              max={20}
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
              min={2}
              max={6}
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
      </section>

      {result && spec && (
        <>
          <section className="panel rules-panel">
            <h2>Which notes may be dropped</h2>
            <table className="rules-table">
              <thead>
                <tr>
                  <th>Tone</th>
                  <th>Note</th>
                  <th>Status</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {result.rules.map((r) => (
                  <tr key={r.tone.degree} className={r.required ? "req" : "opt-row"}>
                    <td className={`role-cell role-${r.tone.role}`}>{r.tone.label}</td>
                    <td className="mono">{r.tone.noteName}</td>
                    <td>
                      <span className={`status ${r.required ? "required" : "optional"}`}>
                        {r.required ? "required" : "may drop"}
                      </span>
                    </td>
                    <td className="why">{r.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

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
              {result.voicings.map((v) => (
                <article className="card" key={v.id}>
                  <div className="card-top">
                    <span className="mono frets">
                      {v.frets.map((f) => (f === null ? "x" : f)).join(" ")}
                    </span>
                    <button
                      type="button"
                      className="play"
                      onClick={() => strum(v.notes.map((n) => n.midi))}
                      aria-label="Play chord"
                    >
                      ▶
                    </button>
                  </div>

                  {tuning && <ChordDiagram voicing={v} tuning={tuning} showDegrees={showDegrees} />}

                  <div className="badges">
                    {v.omitted.map((o) => {
                      const rule = result.rules.find((r) => r.tone.degree === o.tone.degree);
                      return (
                        <span
                          className="badge omit"
                          key={o.tone.degree}
                          title={rule?.explanation ?? ""}
                        >
                          omits the {o.label}
                          {rule?.reason && <em> · {OMISSION_LABELS[rule.reason]}</em>}
                        </span>
                      );
                    })}
                    {v.omitted.length === 0 && <span className="badge complete">all tones</span>}
                    {v.flags.map((f) => (
                      <span className={`badge ${f.kind}`} key={f.text}>
                        {f.text}
                      </span>
                    ))}
                  </div>

                  <div className="card-foot">
                    <span>{v.fingers === 0 ? "open" : `${v.fingers} finger${v.fingers > 1 ? "s" : ""}`}</span>
                    <span>·</span>
                    <span>{v.notes.length} strings</span>
                    <span>·</span>
                    <span>top {v.topTone?.label}</span>
                  </div>
                </article>
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
