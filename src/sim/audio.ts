import {
  AudioModulationState,
  MultiplierValue,
  RingReactionStyle,
  SimulationMode,
  clamp
} from './engine';

export interface SoundscapeMix {
  masterVolume: number;     // 0..1
  ringPulseLevel: number;   // 0..1 Deep resonant tones pulsing with rings
  cometHumLevel: number;    // 0..1 Gentle ethereal hum for comet-core
  shimmerLevel: number;     // 0..1 Subtle shimmering effects for dust & sparks
}

/**
 * Dynamic, generative ambient Web Audio soundscape engine.
 * Combines:
 * 1. Continuous deep resonant drone oscillators that pulse with the breathing rings
 * 2. Continuous gentle ethereal hum modulated by the comet-core's velocity & position
 * 3. Generative high-register crystalline shimmer grains for silver dust & sparks
 * 4. Harmonic glass chimes on ring crossings, user ring touches, and multiplier blooms
 */
class GenerativeAmbientAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted = true;
  private isDroneStarted = false;

  // Continuous nodes
  private masterGain: GainNode | null = null;
  private ringDroneGain: GainNode | null = null;
  private ringFilter: BiquadFilterNode | null = null;
  private ringOsc1: OscillatorNode | null = null;
  private ringOsc2: OscillatorNode | null = null;

  private cometHumGain: GainNode | null = null;
  private cometFilter: BiquadFilterNode | null = null;
  private cometOsc1: OscillatorNode | null = null;
  private cometOsc2: OscillatorNode | null = null;

  private lastShimmerTime = 0;

  private mix: SoundscapeMix = {
    masterVolume: 0.75,
    ringPulseLevel: 0.85,
    cometHumLevel: 0.75,
    shimmerLevel: 0.80
  };

  // Lydian / Pentatonic celestial frequencies (Hz) across 8 rings
  private readonly celestialScale = [
    261.63, // C4
    293.66, // D4
    329.63, // E4
    392.00, // G4
    440.00, // A4
    523.25, // C5
    587.33, // D5
    659.25  // E5
  ];

  // Architectural crystalline minor-9th frequencies for Emerald Lattice
  private readonly emeraldScale = [
    220.00, // A3
    261.63, // C4
    329.63, // E4
    392.00, // G4
    493.88, // B4
    523.25, // C5
    659.25, // E5
    783.99  // G5
  ];

  // High-register crystalline spark & silver dust shimmer harmonics
  private readonly shimmerHarmonics = [
    1046.50, // C6
    1174.66, // D6
    1318.51, // E6
    1567.98, // G6
    1760.00, // A6
    2093.00, // C7
    2349.32, // D7
    2637.02  // E7
  ];

  public setMuted(muted: boolean): boolean {
    this.isMuted = muted;
    if (!muted) {
      const ctx = this.ensureContext();
      if (ctx && this.masterGain) {
        const now = ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setTargetAtTime(this.mix.masterVolume, now, 0.25);
      }
    } else if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(0.0001, now, 0.15);
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMix(partial: Partial<SoundscapeMix>): SoundscapeMix {
    this.mix = { ...this.mix, ...partial };
    if (this.ctx && this.masterGain && !this.isMuted) {
      this.masterGain.gain.setTargetAtTime(this.mix.masterVolume, this.ctx.currentTime, 0.12);
    }
    return this.mix;
  }

  public getMix(): SoundscapeMix {
    return { ...this.mix };
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.ctx && !this.isDroneStarted) {
      this.initContinuousGenerativeLayers(this.ctx);
    }
    return this.ctx;
  }

  private initContinuousGenerativeLayers(ctx: AudioContext): void {
    try {
      this.isDroneStarted = true;
      const now = ctx.currentTime;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0.0001 : this.mix.masterVolume, now);
      this.masterGain.connect(ctx.destination);

      // 1. Deep Resonant Ring Pulse Drone (Sub-bass + Warm Fifth through Resonant Lowpass)
      this.ringFilter = ctx.createBiquadFilter();
      this.ringFilter.type = 'lowpass';
      this.ringFilter.frequency.setValueAtTime(140, now);
      this.ringFilter.Q.setValueAtTime(3.0, now);

      this.ringDroneGain = ctx.createGain();
      this.ringDroneGain.gain.setValueAtTime(0.06, now);

      this.ringOsc1 = ctx.createOscillator();
      this.ringOsc2 = ctx.createOscillator();
      this.ringOsc1.type = 'sine';
      this.ringOsc2.type = 'triangle';
      this.ringOsc1.frequency.setValueAtTime(65.41, now); // Deep C2
      this.ringOsc2.frequency.setValueAtTime(98.00, now); // Warm fifth G2

      this.ringOsc1.connect(this.ringFilter);
      this.ringOsc2.connect(this.ringFilter);
      this.ringFilter.connect(this.ringDroneGain);
      this.ringDroneGain.connect(this.masterGain);

      this.ringOsc1.start(now);
      this.ringOsc2.start(now);

      // 2. Gentle Ethereal Comet-Core Hum (Dual detuned voices through warm bandpass/lowpass)
      this.cometFilter = ctx.createBiquadFilter();
      this.cometFilter.type = 'lowpass';
      this.cometFilter.frequency.setValueAtTime(420, now);
      this.cometFilter.Q.setValueAtTime(1.8, now);

      this.cometHumGain = ctx.createGain();
      this.cometHumGain.gain.setValueAtTime(0.025, now);

      this.cometOsc1 = ctx.createOscillator();
      this.cometOsc2 = ctx.createOscillator();
      this.cometOsc1.type = 'sine';
      this.cometOsc2.type = 'sine';
      this.cometOsc1.frequency.setValueAtTime(196.00, now);
      this.cometOsc2.frequency.setValueAtTime(196.85, now); // Gentle ethereal binaural shimmer

      this.cometOsc1.connect(this.cometFilter);
      this.cometOsc2.connect(this.cometFilter);
      this.cometFilter.connect(this.cometHumGain);
      this.cometHumGain.connect(this.masterGain);

      this.cometOsc1.start(now);
      this.cometOsc2.start(now);
    } catch {
      // Ignore if Web Audio is unavailable in environment
    }
  }

  /**
   * Called continuously from the simulation loop (~12Hz) to modulate the deep ring drone,
   * the comet-core ethereal hum, and spawn delicate crystalline dust/spark shimmer grains.
   */
  public updateGenerativeSoundscape(
    mod: AudioModulationState,
    mode: SimulationMode,
    isPaused: boolean
  ): void {
    if (this.isMuted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    if (isPaused) {
      this.ringDroneGain?.gain.setTargetAtTime(0.008 * this.mix.ringPulseLevel, now, 0.2);
      this.cometHumGain?.gain.setTargetAtTime(0.004 * this.mix.cometHumLevel, now, 0.2);
      return;
    }

    // 1. Modulate Deep Ring Pulse Drone
    if (this.ringFilter && this.ringDroneGain && this.ringOsc1 && this.ringOsc2) {
      const rootFreq = mode === 'celestial' ? 65.41 : 55.0; // C2 vs A1
      const fifthFreq = mode === 'celestial' ? 98.0 : 82.41; // G2 vs E2
      this.ringOsc1.frequency.setTargetAtTime(rootFreq, now, 0.5);
      this.ringOsc2.frequency.setTargetAtTime(fifthFreq, now, 0.5);

      this.ringFilter.frequency.setTargetAtTime(mod.ringFilterCutoffHz, now, 0.15);
      const pulseGain = (0.035 + mod.ringPulseMod * 0.055) * this.mix.ringPulseLevel;
      this.ringDroneGain.gain.setTargetAtTime(pulseGain, now, 0.15);
    }

    // 2. Modulate Ethereal Comet-Core Hum
    if (this.cometOsc1 && this.cometOsc2 && this.cometFilter && this.cometHumGain) {
      this.cometOsc1.frequency.setTargetAtTime(mod.cometPitchHz, now, 0.18);
      this.cometOsc2.frequency.setTargetAtTime(mod.cometPitchHz * 1.004, now, 0.18);
      this.cometFilter.frequency.setTargetAtTime(mod.cometPitchHz * 2.4, now, 0.18);

      const humGain = mod.cometHumIntensity * 0.038 * this.mix.cometHumLevel;
      this.cometHumGain.gain.setTargetAtTime(humGain, now, 0.18);
    }

    // 3. Generative Shimmering Effects for Silver Dust & Crystalline Sparks
    const shimmerInterval = clamp(0.55 - mod.shimmerDensity * 0.38, 0.14, 0.6);
    if (this.mix.shimmerLevel > 0.02 && now - this.lastShimmerTime >= shimmerInterval) {
      this.lastShimmerTime = now;
      this.spawnSparkShimmerGrain(mod.shimmerDensity);
    }
  }

  private spawnSparkShimmerGrain(density: number): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const idx = Math.floor(Math.random() * this.shimmerHarmonics.length);
    const freq = this.shimmerHarmonics[idx] * (0.998 + Math.random() * 0.004);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    const peakGain = (0.005 + density * 0.009) * this.mix.shimmerLevel;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.9);
  }

  /**
   * Plays a soft glass/crystal bell note when the comet or photon traverses a concentric ring.
   */
  public playRingPassage(ringIndex: number, mode: SimulationMode): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || ctx.state !== 'running' || !this.masterGain) return;

    const scale = mode === 'celestial' ? this.celestialScale : this.emeraldScale;
    const freq = scale[ringIndex % scale.length];
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    overtone.type = 'triangle';
    overtone.frequency.setValueAtTime(freq * (mode === 'celestial' ? 2.0 : 1.5), now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.038 * this.mix.ringPulseLevel, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.1);

    osc.connect(gain);
    overtone.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    overtone.start(now);
    osc.stop(now + 2.15);
    overtone.stop(now + 2.15);
  }

  /**
   * Plays a tactile resonant harmonic swell when a user directly touches or clicks a concentric ring.
   */
  public playRingTouch(
    ringIndex: number,
    mode: SimulationMode,
    reactionStyle: RingReactionStyle = 'harmonic'
  ): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || ctx.state !== 'running' || !this.masterGain) return;

    const scale = mode === 'celestial' ? this.celestialScale : this.emeraldScale;
    const baseFreq = scale[ringIndex % scale.length];
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    subOsc.type = 'triangle';

    // Pitch bend slightly according to reaction style
    osc.frequency.setValueAtTime(baseFreq, now);
    if (reactionStyle === 'expand' || reactionStyle === 'harmonic') {
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.125, now + 0.35);
      osc.frequency.exponentialRampToValueAtTime(baseFreq, now + 1.4);
    }
    subOsc.frequency.setValueAtTime(baseFreq * 0.5, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055 * this.mix.ringPulseLevel, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.85);

    osc.connect(gain);
    subOsc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    subOsc.start(now);
    osc.stop(now + 1.9);
    subOsc.stop(now + 1.9);
  }

  /**
   * Plays a lush, shimmering harmonic bloom chord when a ×7, ×13, or ×31 multiplier triggers.
   */
  public playMultiplierBloom(multiplier: MultiplierValue, mode: SimulationMode): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || ctx.state !== 'running' || !this.masterGain) return;

    const scale = mode === 'celestial' ? this.celestialScale : this.emeraldScale;
    const chordIndices =
      multiplier === 31 ? [0, 2, 4, 6, 7] : multiplier === 13 ? [0, 2, 4, 5] : [0, 2, 4];
    const now = ctx.currentTime;

    chordIndices.forEach((idx, i) => {
      if (!this.masterGain) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(scale[idx % scale.length], now + i * 0.05);

      gain.gain.setValueAtTime(0.0001, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.036, now + i * 0.05 + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.05 + 3.4);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 3.5);
    });
  }
}

export const soundEngine = new GenerativeAmbientAudioEngine();
