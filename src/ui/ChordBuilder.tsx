import {
  ROOT_CHOICES,
  type Alteration,
  type ChordBuilderState,
  type ExtensionMode,
  type Seventh,
  type Triad,
} from "../theory/chord";

interface Props {
  state: ChordBuilderState;
  onChange: (next: ChordBuilderState) => void;
  symbol: string;
}

const TRIADS: { value: Triad; label: string; hint: string }[] = [
  { value: "maj", label: "major", hint: "1 3 5" },
  { value: "min", label: "minor", hint: "1 b3 5" },
  { value: "dim", label: "dim", hint: "1 b3 b5" },
  { value: "aug", label: "aug", hint: "1 3 #5" },
  { value: "sus2", label: "sus2", hint: "1 2 5" },
  { value: "sus4", label: "sus4", hint: "1 4 5" },
  { value: "five", label: "power", hint: "1 5" },
];

const SEVENTHS: { value: Seventh; label: string; hint: string }[] = [
  { value: "none", label: "none", hint: "plain triad" },
  { value: "6", label: "6th", hint: "adds the 6" },
  { value: "b7", label: "b7", hint: "dominant / minor 7" },
  { value: "maj7", label: "maj7", hint: "major 7" },
];

const EXT_MODES: { value: ExtensionMode; label: string }[] = [
  { value: "off", label: "off" },
  { value: "on", label: "stacked" },
  { value: "add", label: "add" },
];

const ALTERATIONS: { value: Alteration; label: string }[] = [
  { value: "b5", label: "b5" },
  { value: "#5", label: "#5" },
  { value: "b9", label: "b9" },
  { value: "#9", label: "#9" },
  { value: "#11", label: "#11" },
  { value: "b13", label: "b13" },
];

const PRESETS: { label: string; patch: Partial<ChordBuilderState> }[] = [
  { label: "maj7", patch: { triad: "maj", seventh: "maj7", ext9: "off", ext11: "off", ext13: "off", alterations: [] } },
  { label: "m7", patch: { triad: "min", seventh: "b7", ext9: "off", ext11: "off", ext13: "off", alterations: [] } },
  { label: "7", patch: { triad: "maj", seventh: "b7", ext9: "off", ext11: "off", ext13: "off", alterations: [] } },
  { label: "m7b5", patch: { triad: "dim", seventh: "b7", ext9: "off", ext11: "off", ext13: "off", alterations: [] } },
  { label: "dim7", patch: { triad: "dim", seventh: "6", ext9: "off", ext11: "off", ext13: "off", alterations: [] } },
  { label: "9", patch: { triad: "maj", seventh: "b7", ext9: "on", ext11: "off", ext13: "off", alterations: [] } },
  { label: "13", patch: { triad: "maj", seventh: "b7", ext9: "on", ext11: "off", ext13: "on", alterations: [] } },
  { label: "add9", patch: { triad: "maj", seventh: "none", ext9: "add", ext11: "off", ext13: "off", alterations: [] } },
  { label: "m(add11)", patch: { triad: "min", seventh: "none", ext9: "off", ext11: "add", ext13: "off", alterations: [] } },
  { label: "6/9", patch: { triad: "maj", seventh: "6", ext9: "on", ext11: "off", ext13: "off", alterations: [] } },
  { label: "7#9", patch: { triad: "maj", seventh: "b7", ext9: "off", ext11: "off", ext13: "off", alterations: ["#9"] } },
  { label: "7alt", patch: { triad: "maj", seventh: "b7", ext9: "off", ext11: "off", ext13: "off", alterations: ["#5", "#9"] } },
];

export function ChordBuilder({ state, onChange, symbol }: Props) {
  const set = (patch: Partial<ChordBuilderState>) => onChange({ ...state, ...patch });

  const toggleAlteration = (a: Alteration) => {
    const has = state.alterations.includes(a);
    // b5/#5 are mutually exclusive, as are b9/#9.
    let next = has ? state.alterations.filter((x) => x !== a) : [...state.alterations, a];
    if (!has) {
      if (a === "b5") next = next.filter((x) => x !== "#5");
      if (a === "#5") next = next.filter((x) => x !== "b5");
      if (a === "b9") next = next.filter((x) => x !== "#9");
      if (a === "#9") next = next.filter((x) => x !== "b9");
    }
    set({ alterations: next });
  };

  return (
    <div className="builder">
      <div className="builder-headline">
        <span className="builder-symbol">{symbol}</span>
        <span className="builder-caption">built from blocks — no typing required</span>
      </div>

      <div className="block">
        <div className="block-title">Root</div>
        <div className="chip-row">
          {ROOT_CHOICES.map((r) => (
            <button
              key={r}
              type="button"
              className={`chip ${state.root === r ? "on" : ""}`}
              onClick={() => set({ root: r })}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="block">
        <div className="block-title">Quality</div>
        <div className="chip-row">
          {TRIADS.map((t) => (
            <button
              key={t.value}
              type="button"
              title={t.hint}
              className={`chip wide ${state.triad === t.value ? "on" : ""}`}
              onClick={() => set({ triad: t.value })}
            >
              {t.label}
              <span className="chip-hint">{t.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="block">
        <div className="block-title">6th / 7th</div>
        <div className="chip-row">
          {SEVENTHS.map((s) => (
            <button
              key={s.value}
              type="button"
              title={s.hint}
              className={`chip wide ${state.seventh === s.value ? "on" : ""}`}
              onClick={() => set({ seventh: s.value })}
            >
              {s.label}
              <span className="chip-hint">{s.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="block">
        <div className="block-title">
          Extensions
          <span className="block-note">
            “stacked” folds it into the name (G9); “add” bolts it on without the 7th (Gadd9)
          </span>
        </div>
        <div className="ext-grid">
          {([
            ["9", state.ext9, (m: ExtensionMode) => set({ ext9: m })],
            ["11", state.ext11, (m: ExtensionMode) => set({ ext11: m })],
            ["13", state.ext13, (m: ExtensionMode) => set({ ext13: m })],
          ] as const).map(([label, value, setter]) => (
            <div className="ext-row" key={label}>
              <span className="ext-label">{label}</span>
              <div className="seg">
                {EXT_MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    className={`seg-btn ${value === m.value ? "on" : ""}`}
                    onClick={() => setter(m.value)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="block">
        <div className="block-title">Alterations</div>
        <div className="chip-row">
          {ALTERATIONS.map((a) => (
            <button
              key={a.value}
              type="button"
              className={`chip ${state.alterations.includes(a.value) ? "on alt" : ""}`}
              onClick={() => toggleAlteration(a.value)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="block">
        <div className="block-title">Common shapes</div>
        <div className="chip-row">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="chip ghost"
              onClick={() => set({ ...p.patch, bass: null })}
            >
              {state.root}
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="block">
        <div className="block-title">Slash bass</div>
        <div className="chip-row">
          <button
            type="button"
            className={`chip ${state.bass === null ? "on" : ""}`}
            onClick={() => set({ bass: null })}
          >
            none
          </button>
          {ROOT_CHOICES.map((r) => (
            <button
              key={r}
              type="button"
              className={`chip small ${state.bass === r ? "on" : ""}`}
              onClick={() => set({ bass: state.bass === r ? null : r })}
            >
              /{r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
