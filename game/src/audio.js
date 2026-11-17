// Synthesised sound effects: every noise the game makes is an oscillator or a filtered noise
// burst built on the spot — no audio files, nothing to load. The context is created lazily on
// the first user gesture, as browsers require, and M mutes. Unknown or unavailable audio is a
// no-op: sound never breaks the game.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  const lastPlayed = new Map();

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
  }

  function tone(freqFrom, freqTo, seconds, type, volume, delay = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t0 + seconds);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  }

  function noise(seconds, volume, filterFreq, delay = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t0);
  }

  /** Play a named effect, throttling the chatty ones so volleys do not clip. */
  function play(name) {
    if (!ctx || muted) return;
    const now = performance.now();
    const throttle = name === 'shoot' ? 50 : name === 'pickup' ? 60 : 0;
    if (throttle > 0) {
      if (now - (lastPlayed.get(name) ?? 0) < throttle) return;
      lastPlayed.set(name, now);
    }
    switch (name) {
      case 'shoot': tone(880, 320, 0.07, 'square', 0.05); break;
      case 'eshoot': tone(300, 190, 0.1, 'sawtooth', 0.045); break;
      case 'boom': noise(0.22, 0.22, 900); tone(160, 50, 0.2, 'triangle', 0.16); break;
      case 'bigboom': noise(0.6, 0.4, 620); tone(120, 32, 0.55, 'triangle', 0.3); break;
      case 'hurt': tone(220, 70, 0.22, 'sawtooth', 0.2); noise(0.15, 0.14, 1400); break;
      case 'dash': noise(0.16, 0.1, 2600); tone(300, 720, 0.14, 'sine', 0.07); break;
      case 'pickup': tone(1180, 1560, 0.06, 'sine', 0.06); break;
      case 'heal': tone(520, 780, 0.16, 'sine', 0.12); break;
      case 'wave': tone(392, 392, 0.1, 'square', 0.08); tone(587, 587, 0.12, 'square', 0.08, 0.1); break;
      case 'upgrade': tone(523, 523, 0.09, 'square', 0.09); tone(784, 784, 0.12, 'square', 0.09, 0.09); break;
      case 'power': tone(440, 440, 0.08, 'square', 0.1); tone(660, 660, 0.08, 'square', 0.1, 0.08); tone(880, 880, 0.16, 'square', 0.11, 0.16); break;
      case 'bosswarn': tone(196, 196, 0.16, 'sawtooth', 0.14); tone(185, 185, 0.16, 'sawtooth', 0.14, 0.2); break;
      case 'bossalarm': tone(98, 98, 0.3, 'sawtooth', 0.2); tone(98, 130, 0.34, 'sawtooth', 0.16, 0.12); break;
      case 'bosscharge': tone(140, 420, 0.3, 'sawtooth', 0.1); break;
      case 'click': tone(700, 700, 0.05, 'square', 0.07); break;
      case 'over':
        tone(392, 392, 0.22, 'triangle', 0.16);
        tone(311, 311, 0.22, 'triangle', 0.16, 0.22);
        tone(233, 233, 0.5, 'triangle', 0.16, 0.44);
        break;
      default: break;
    }
  }

  return {
    unlock,
    play,
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() { return muted; },
  };
}
