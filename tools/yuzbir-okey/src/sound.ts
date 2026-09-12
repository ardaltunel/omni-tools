export type Effect =
  | "pick"
  | "drop"
  | "draw"
  | "sort"
  | "open"
  | "turn"
  | "error"
  | "finish"
  | "flip";
let context: AudioContext | undefined;
export function unlockSound() {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
  } catch {}
}
export function playEffect(effect: Effect, enabled: boolean, volume = 0.65) {
  if (!enabled) return;
  unlockSound();
  if (!context || context.state !== "running") return;
  const ctx = context,
    now = ctx.currentTime;
  const tone = (
    freq: number,
    duration: number,
    gain: number,
    delay = 0,
    type: OscillatorType = "sine",
  ) => {
    const o = ctx.createOscillator(),
      v = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    v.gain.setValueAtTime(0, now + delay);
    v.gain.linearRampToValueAtTime(gain * volume, now + delay + 0.004);
    v.gain.exponentialRampToValueAtTime(0.00001, now + delay + duration);
    o.connect(v);
    v.connect(ctx.destination);
    o.start(now + delay);
    o.stop(now + delay + duration + 0.01);
    o.onended = () => {
      o.disconnect();
      v.disconnect();
    };
  };
  const tap = (delay = 0, strength = 1) => {
    tone(6765, 0.027, 0.009 * strength, delay);
    tone(1850, 0.039, 0.005 * strength, delay);
    tone(380, 0.047, 0.004 * strength, delay);
    const buffer = ctx.createBuffer(
        1,
        Math.ceil(ctx.sampleRate * 0.028),
        ctx.sampleRate,
      ),
      data = buffer.getChannelData(0);
    for (let k = 0; k < data.length; k++)
      data[k] =
        (Math.random() * 2 - 1) *
        Math.exp(-k / (ctx.sampleRate * 0.004)) *
        0.012 *
        strength *
        volume;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(now + delay);
    source.onended = () => source.disconnect();
  };
  if (effect === "turn") {
    tone(110, 0.19, 0.025);
    tone(220, 0.16, 0.012);
    tone(440, 0.15, 0.016);
  } else if (effect === "finish") {
    [578, 734, 880, 1156].forEach((f, k) => tone(f, 0.35, 0.022, k * 0.11));
  } else if (effect === "error") {
    tone(180, 0.13, 0.018);
    tone(145, 0.16, 0.015, 0.12);
  } else if (effect === "sort" || effect === "open") {
    for (let k = 0; k < 6; k++) tap(k * 0.035, 0.45);
  } else if (effect === "flip") {
    tap(0, 0.55);
    tap(0.16, 0.6);
  } else tap(0, effect === "pick" ? 0.35 : effect === "draw" ? 0.5 : 0.7);
}
