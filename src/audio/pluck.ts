/**
 * Karplus-Strong plucked string. No samples to host, and it sounds enough like
 * a guitar to judge a voicing by ear.
 */

let ctx: AudioContext | null = null;

function audioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function pluck(ac: AudioContext, midi: number, at: number, gain: number) {
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const duration = 2.6;
  const sampleRate = ac.sampleRate;
  const n = Math.floor(duration * sampleRate);
  const buffer = ac.createBuffer(1, n, sampleRate);
  const data = buffer.getChannelData(0);

  const delay = Math.max(2, Math.round(sampleRate / freq));
  const ring = new Float32Array(delay);
  for (let i = 0; i < delay; i++) ring[i] = Math.random() * 2 - 1;

  // Slight low-pass on the excitation keeps it from sounding like a snare.
  let prev = 0;
  for (let i = 0; i < delay; i++) {
    prev = 0.5 * ring[i] + 0.5 * prev;
    ring[i] = prev;
  }

  const decay = 0.996;
  let idx = 0;
  let last = 0;
  for (let i = 0; i < n; i++) {
    const cur = ring[idx];
    const out = 0.5 * (cur + last) * decay;
    last = cur;
    ring[idx] = out;
    data[i] = out;
    idx = (idx + 1) % delay;
  }

  const src = ac.createBufferSource();
  src.buffer = buffer;
  const g = ac.createGain();
  g.gain.value = gain;
  const body = ac.createBiquadFilter();
  body.type = "lowpass";
  body.frequency.value = 3400;
  src.connect(body).connect(g).connect(ac.destination);
  src.start(at);
}

/** Strum a set of MIDI notes low to high. */
export function strum(midis: number[], opts: { spread?: number } = {}) {
  const ac = audioContext();
  const now = ac.currentTime + 0.02;
  const spread = opts.spread ?? 0.028;
  midis.forEach((m, i) => pluck(ac, m, now + i * spread, 0.32));
}
