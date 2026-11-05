import {
  SFX_ARROW_FIRE_MAX_VOICES,
  SFX_BODY_HIT_MAX_VOICES,
  SFX_SLIME_BURST_WINDUP_MAX_VOICES,
  SFX_SLIME_HIT_MAX_VOICES,
  type SfxSettings,
} from './sfx-config.ts';

/** Browser-only asset URLs — keep out of sfx-config so Vite's Node config load never sees import.meta.env. */
const sfxArrowFireUrl = () => `${import.meta.env.BASE_URL}audio/bow01.wav`;
const sfxBodyHitUrl = () => `${import.meta.env.BASE_URL}audio/Hitted_Body2100001.wav`;
const sfxSlimeHitUrls = () =>
  [
    `${import.meta.env.BASE_URL}audio/slime_10.wav`,
    `${import.meta.env.BASE_URL}audio/slime_11.wav`,
  ] as const;
const sfxSlimeBurstWindupUrls = () =>
  [
    `${import.meta.env.BASE_URL}audio/slime-burst-windup/windup_gurg_a.wav`,
    `${import.meta.env.BASE_URL}audio/slime-burst-windup/windup_gurg_b.wav`,
    `${import.meta.env.BASE_URL}audio/slime-burst-windup/windup_pour.wav`,
    `${import.meta.env.BASE_URL}audio/slime-burst-windup/windup_vamp.wav`,
  ] as const;

type Voice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  startedAt: number;
  duration: number;
  rate: number;
};

export type PitchVolume = {
  enabled: boolean;
  volume: number;
  pitchMin: number;
  pitchMax: number;
  volumeJitter: number;
};

/** Shared Web Audio loader / polyphony for short one-shots. */
export class OneShotBank {
  private ctx: AudioContext | null = null;
  private buffers: AudioBuffer[] = [];
  private loadPromise: Promise<AudioBuffer[]> | null = null;
  private voices: Voice[] = [];
  private lastIndex = -1;
  private unlockBound = false;
  private urls: readonly string[];
  private maxVoices: number;
  private avoidLast: boolean;

  constructor(urls: readonly string[], maxVoices: number, avoidLast = false) {
    this.urls = urls;
    this.maxVoices = maxVoices;
    this.avoidLast = avoidLast;
  }

  preload() {
    void this.ensureBuffers();
  }

  unlock() {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') void ctx.resume();
  }

  bindUnlock(root: HTMLElement | Document = document) {
    if (this.unlockBound) return;
    this.unlockBound = true;
    const once = () => {
      this.unlock();
      root.removeEventListener('pointerdown', once);
      root.removeEventListener('keydown', once);
    };
    root.addEventListener('pointerdown', once);
    root.addEventListener('keydown', once);
  }

  play(params: PitchVolume) {
    if (!params.enabled) return;
    const baseVolume = Math.max(0, Math.min(1, params.volume));
    if (baseVolume <= 1e-6) return;

    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') void ctx.resume();

    if (this.buffers.length) {
      this.startVoice(params, baseVolume);
      return;
    }
    void this.ensureBuffers().then(buffers => {
      if (!buffers.length || !params.enabled) return;
      this.startVoice(params, baseVolume);
    });
  }

  /** Play a fixed buffer index (0-based). Out-of-range indices wrap via modulo. */
  playIndex(index: number, params: PitchVolume) {
    if (!params.enabled) return;
    const baseVolume = Math.max(0, Math.min(1, params.volume));
    if (baseVolume <= 1e-6) return;

    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') void ctx.resume();

    const run = () => {
      if (!this.buffers.length || !params.enabled) return;
      const n = this.buffers.length;
      const i = ((Math.floor(index) % n) + n) % n;
      this.startVoice(params, baseVolume, i);
    };

    if (this.buffers.length) {
      run();
      return;
    }
    void this.ensureBuffers().then(run);
  }

  stopAll() {
    for (const v of this.voices) this.stopVoice(v);
    this.voices.length = 0;
  }

  get activeCount() {
    return this.voices.length;
  }

  dispose() {
    this.stopAll();
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.buffers = [];
    this.loadPromise = null;
    this.lastIndex = -1;
  }

  private startVoice(params: PitchVolume, baseVolume: number, forcedIndex?: number) {
    if (!this.buffers.length) return;
    const ctx = this.ensureContext();
    this.pruneVoices(ctx.currentTime);

    while (this.voices.length >= this.maxVoices) {
      const oldest = this.voices.shift();
      if (oldest) this.stopVoice(oldest);
    }

    const index = forcedIndex === undefined ? this.pickIndex() : forcedIndex;
    this.lastIndex = index;
    const buffer = this.buffers[index]!;

    let lo = params.pitchMin;
    let hi = params.pitchMax;
    if (lo > hi) [lo, hi] = [hi, lo];
    const semitone = lo + Math.random() * (hi - lo);
    const rate = Math.pow(2, semitone / 12);

    const jitter = Math.max(0, Math.min(0.5, params.volumeJitter));
    let volume = baseVolume;
    if (jitter > 0) {
      volume = baseVolume * (1 - jitter + Math.random() * jitter * 2);
      volume = Math.max(0.05, Math.min(1, volume));
    }

    const gain = ctx.createGain();
    gain.gain.value = volume;
    gain.connect(ctx.destination);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(gain);
    const startedAt = ctx.currentTime;
    const voice: Voice = { source, gain, startedAt, duration: buffer.duration, rate };
    source.onended = () => {
      this.voices = this.voices.filter(v => v !== voice);
      this.disconnectVoice(voice);
    };
    source.start(0);
    this.voices.push(voice);
  }

  private pickIndex() {
    const n = this.buffers.length;
    if (n <= 1) return 0;
    if (!this.avoidLast || this.lastIndex < 0) return Math.floor(Math.random() * n);
    let idx = Math.floor(Math.random() * (n - 1));
    if (idx >= this.lastIndex) idx += 1;
    return idx;
  }

  private pruneVoices(now: number) {
    this.voices = this.voices.filter(v => {
      const alive = now < v.startedAt + v.duration / Math.max(0.05, v.rate) + 0.05;
      if (!alive) this.disconnectVoice(v);
      return alive;
    });
  }

  private stopVoice(voice: Voice) {
    try { voice.source.stop(); } catch { /* already stopped */ }
    this.disconnectVoice(voice);
  }

  private disconnectVoice(voice: Voice) {
    try { voice.source.disconnect(); voice.gain.disconnect(); } catch { /* noop */ }
  }

  private ensureContext() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
    }
    return this.ctx;
  }

  private ensureBuffers() {
    if (this.buffers.length) return Promise.resolve(this.buffers);
    if (this.loadPromise) return this.loadPromise;
    const ctx = this.ensureContext();
    this.loadPromise = Promise.all(
      this.urls.map(url =>
        fetch(url)
          .then(r => {
            if (!r.ok) throw new Error(`无法加载音效 ${url}`);
            return r.arrayBuffer();
          })
          .then(data => ctx.decodeAudioData(data.slice(0))),
      ),
    )
      .then(buffers => {
        this.buffers = buffers;
        return buffers;
      })
      .catch(err => {
        console.warn('[sfx]', err);
        this.loadPromise = null;
        return [] as AudioBuffer[];
      });
    return this.loadPromise;
  }
}

type ArrowFirePlaySettings = Pick<
  SfxSettings,
  'sfxArrowFireEnabled' | 'sfxArrowFireVolume' | 'sfxArrowFirePitchMin' | 'sfxArrowFirePitchMax'
>;

/**
 * Bow-fire one-shot (Erdie bow01, CC BY 4.0).
 * Plays once per ArrowProjectiles.fire(), including staggered volley arrows.
 */
export class ArrowFireSfx {
  private bank = new OneShotBank([sfxArrowFireUrl()], SFX_ARROW_FIRE_MAX_VOICES, false);

  preload() { this.bank.preload(); }
  unlock() { this.bank.unlock(); }
  bindUnlock(root?: HTMLElement | Document) { this.bank.bindUnlock(root); }
  get activeCount() { return this.bank.activeCount; }
  dispose() { this.bank.dispose(); }

  play(settings: ArrowFirePlaySettings) {
    this.bank.play({
      enabled: !!settings.sfxArrowFireEnabled,
      volume: settings.sfxArrowFireVolume,
      pitchMin: settings.sfxArrowFirePitchMin,
      pitchMax: settings.sfxArrowFirePitchMax,
      volumeJitter: 0,
    });
  }
}

type BodyHitPlaySettings = Pick<
  SfxSettings,
  'sfxBodyHitEnabled' | 'sfxBodyHitVolume' | 'sfxBodyHitPitchMin' | 'sfxBodyHitPitchMax'
>;

/** Instant flesh hit (Hitted_Body) on yellow-slime impact. */
export class BodyHitSfx {
  private bank = new OneShotBank([sfxBodyHitUrl()], SFX_BODY_HIT_MAX_VOICES, false);

  preload() { this.bank.preload(); }
  unlock() { this.bank.unlock(); }
  bindUnlock(root?: HTMLElement | Document) { this.bank.bindUnlock(root); }
  get activeCount() { return this.bank.activeCount; }
  dispose() { this.bank.dispose(); }

  play(settings: BodyHitPlaySettings) {
    this.bank.play({
      enabled: !!settings.sfxBodyHitEnabled,
      volume: settings.sfxBodyHitVolume,
      pitchMin: settings.sfxBodyHitPitchMin,
      pitchMax: settings.sfxBodyHitPitchMax,
      volumeJitter: 0,
    });
  }
}

type SlimeHitPlaySettings = Pick<
  SfxSettings,
  | 'sfxSlimeHitEnabled'
  | 'sfxSlimeHitVolume'
  | 'sfxSlimeHitPitchMin'
  | 'sfxSlimeHitPitchMax'
  | 'sfxSlimeHitVolumeJitter'
  | 'sfxSlimeHitDelay'
>;

/**
 * Slime sample pool with avoid-last + pitch/volume jitter.
 * Plays after `sfxSlimeHitDelay` seconds from the hit (default 0.12).
 */
export class SlimeHitSfx {
  private bank = new OneShotBank(sfxSlimeHitUrls(), SFX_SLIME_HIT_MAX_VOICES, true);
  private pending: number[] = [];

  preload() { this.bank.preload(); }
  unlock() { this.bank.unlock(); }
  bindUnlock(root?: HTMLElement | Document) { this.bank.bindUnlock(root); }
  get activeCount() { return this.bank.activeCount; }
  get pendingCount() { return this.pending.length; }

  dispose() {
    for (const id of this.pending) clearTimeout(id);
    this.pending.length = 0;
    this.bank.dispose();
  }

  play(settings: SlimeHitPlaySettings) {
    if (!settings.sfxSlimeHitEnabled) return;
    const snap: PitchVolume = {
      enabled: true,
      volume: settings.sfxSlimeHitVolume,
      pitchMin: settings.sfxSlimeHitPitchMin,
      pitchMax: settings.sfxSlimeHitPitchMax,
      volumeJitter: settings.sfxSlimeHitVolumeJitter,
    };
    const delay = Math.max(0, settings.sfxSlimeHitDelay || 0);
    if (delay <= 1e-6) {
      this.bank.play(snap);
      return;
    }
    const id = window.setTimeout(() => {
      this.pending = this.pending.filter(t => t !== id);
      this.bank.play(snap);
    }, delay * 1000);
    this.pending.push(id);
  }
}

type SlimeBurstWindupPlaySettings = Pick<
  SfxSettings,
  | 'sfxSlimeBurstWindupEnabled'
  | 'sfxSlimeBurstWindupVariant'
  | 'sfxSlimeBurstWindupVolume'
  | 'sfxSlimeBurstWindupPitchMin'
  | 'sfxSlimeBurstWindupPitchMax'
>;

/**
 * Yellow-slime winding one-shot. Plays the selected variant (1–4) once on
 * feedback→winding; call stop() when the burst reaches gone.
 */
export class SlimeBurstWindupSfx {
  private bank = new OneShotBank(sfxSlimeBurstWindupUrls(), SFX_SLIME_BURST_WINDUP_MAX_VOICES, false);

  preload() { this.bank.preload(); }
  unlock() { this.bank.unlock(); }
  bindUnlock(root?: HTMLElement | Document) { this.bank.bindUnlock(root); }
  get activeCount() { return this.bank.activeCount; }
  dispose() { this.bank.dispose(); }
  stop() { this.bank.stopAll(); }

  play(settings: SlimeBurstWindupPlaySettings) {
    if (!settings.sfxSlimeBurstWindupEnabled) return;
    const variant = Math.max(1, Math.min(4, Math.round(settings.sfxSlimeBurstWindupVariant || 1)));
    this.bank.playIndex(variant - 1, {
      enabled: true,
      volume: settings.sfxSlimeBurstWindupVolume,
      pitchMin: settings.sfxSlimeBurstWindupPitchMin,
      pitchMax: settings.sfxSlimeBurstWindupPitchMax,
      volumeJitter: 0,
    });
  }
}
