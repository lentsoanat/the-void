import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HypnoticCanvas, SimHudTelemetry } from './components/HypnoticCanvas';
import {
  CoalescencePattern,
  MULTIPLIER_SEQUENCE,
  MultiplierValue,
  PhotonGuidanceMode,
  RingReactionStyle,
  SimulationMode,
  clamp
} from './sim/engine';
import { soundEngine, SoundscapeMix } from './sim/audio';

type MobileSheetTab = 'motion' | 'rings' | 'audio';

export default function App() {
  const [mode, setMode] = useState<SimulationMode>('celestial');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [isZenMode, setIsZenMode] = useState<boolean>(false);
  const [isFullBleedStage, setIsFullBleedStage] = useState<boolean>(false);

  // Mobile/Tablet Responsive Control Drawer State
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<MobileSheetTab>('motion');

  // Ring & Lattice Physics Controls
  const [timeScale, setTimeScale] = useState<number>(1.0);
  const [breathIntensity, setBreathIntensity] = useState<number>(1.0);
  const [breathSpeed, setBreathSpeed] = useState<number>(1.0);
  const [guidanceMode, setGuidanceMode] = useState<PhotonGuidanceMode>('orbital');
  const [ringReactionStyle, setRingReactionStyle] = useState<RingReactionStyle>('harmonic');
  const [forcedPattern, setForcedPattern] = useState<CoalescencePattern | 'auto'>('auto');

  // Generative Ambient Soundscape Layer Mix
  const [audioMix, setAudioMix] = useState<SoundscapeMix>({
    masterVolume: 0.75,
    ringPulseLevel: 0.85,
    cometHumLevel: 0.75,
    shimmerLevel: 0.80
  });

  const [telemetry, setTelemetry] = useState<SimHudTelemetry>({
    countdown: 240,
    latticeScore: 144,
    activeMultiplier: null,
    bloomReason: 'Harmonic Convergence',
    bloomIntensity: 0,
    activePattern: 'scatter',
    filamentCount: 3,
    ringCrossings: 3,
    lastTouchedRing: null,
    ringTouchCount: 0,
    ringFilterHz: 165,
    cometPitchHz: 196
  });

  const bloomRequestRef = useRef<MultiplierValue | null>(null);
  const ringTouchRequestRef = useRef<number | null>(null);
  const clearLatticeRequestRef = useRef<boolean>(false);
  const nextMultiplierIdxRef = useRef<number>(0);
  const nextRingIdxRef = useRef<number>(2);

  useEffect(() => {
    document.body.dataset.state = isPaused ? 'paused' : 'playing';
    document.body.dataset.mode = mode;
  }, [isPaused, mode]);

  const handleTriggerBloom = useCallback((specificMult?: MultiplierValue) => {
    if (specificMult) {
      bloomRequestRef.current = specificMult;
    } else {
      const m = MULTIPLIER_SEQUENCE[nextMultiplierIdxRef.current % MULTIPLIER_SEQUENCE.length];
      nextMultiplierIdxRef.current += 1;
      bloomRequestRef.current = m;
    }
  }, []);

  const handleTriggerRingPulse = useCallback((ringIdx?: number) => {
    if (ringIdx !== undefined) {
      ringTouchRequestRef.current = ringIdx;
    } else {
      const r = nextRingIdxRef.current % 8;
      nextRingIdxRef.current += 1;
      ringTouchRequestRef.current = r;
    }
  }, []);

  const handleToggleAudio = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const handleMixChange = useCallback(
    (partial: Partial<SoundscapeMix>) => {
      const updated = soundEngine.setMix(partial);
      setAudioMix(updated);
      if (isMuted) {
        setIsMuted(false);
        soundEngine.setMuted(false);
      }
    },
    [isMuted]
  );

  const handleWheelAdjustSpeed = useCallback((delta: number) => {
    setBreathSpeed((prev) => Number(clamp(prev + delta, 0.2, 2.5).toFixed(1)));
  }, []);

  const handleResetLattice = useCallback(() => {
    clearLatticeRequestRef.current = true;
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setIsPaused((p) => !p);
      } else if (e.key === '1') {
        setMode('celestial');
      } else if (e.key === '2') {
        setMode('emerald');
      } else if (e.key === 'b' || e.key === 'B') {
        handleTriggerBloom();
      } else if (e.key === 'r' || e.key === 'R') {
        handleTriggerRingPulse();
      } else if (e.key === 'm' || e.key === 'M') {
        handleToggleAudio();
      } else if (e.key === 'f' || e.key === 'F') {
        setIsFullBleedStage((f) => !f);
      } else if (e.key === 'z' || e.key === 'Z' || e.key === 'Escape') {
        if (isMobileSheetOpen) {
          setIsMobileSheetOpen(false);
        } else {
          setIsZenMode((z) => !z);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTriggerBloom, handleTriggerRingPulse, handleToggleAudio, isMobileSheetOpen]);

  const patternLabel =
    telemetry.activePattern === 'mandala'
      ? 'Sacred Lotus Mandala'
      : telemetry.activePattern === 'galaxy'
        ? 'Spiral Galaxy Vortex'
        : 'Crystalline Drift';

  return (
    <main className="relative w-screen h-[100dvh] overflow-hidden bg-[#03020a] flex items-center justify-center select-none">
      {/* Subtle ambient background glow on desktop framing the 9:16 vertical monolith */}
      {!isFullBleedStage && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 hidden lg:block"
          style={{
            background:
              mode === 'celestial'
                ? 'radial-gradient(circle at 50% 50%, rgba(124, 58, 237, 0.11) 0%, rgba(20, 14, 48, 0.05) 45%, rgba(3, 2, 10, 1) 80%)'
                : 'radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.09) 0%, rgba(4, 18, 16, 0.04) 45%, rgba(1, 2, 3, 1) 80%)'
          }}
        />
      )}

      <div
        className={`relative w-full h-full flex items-center justify-center ${
          isFullBleedStage ? '' : 'max-w-[1440px] mx-auto lg:gap-8 lg:px-8'
        }`}
      >
        {/* LEFT COLUMN (Desktop Only, when in 9:16 Studio Frame & not Zen): Direction, Photon Guidance & Ring Touch */}
        {!isZenMode && !isFullBleedStage && (
          <aside
            aria-label="Simulation Architecture and Guidance"
            className="hidden lg:flex flex-col justify-between w-76 h-[min(92dvh,880px)] py-3 shrink-0"
          >
            <div className="space-y-4">
              <div>
                <p className="text-[11px] tracking-[0.22em] text-slate-400 font-mono-tabular">
                  01 · HYPNOTIC 9:16 CHAMBER
                </p>
                <h1 className="mt-1 text-2xl font-light tracking-wide text-slate-100 font-display-thin">
                  Aetheris Resonance
                </h1>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  {mode === 'celestial'
                    ? 'Concentric liquid-light rings pulse across electric violet, molten gold, and icy teal. Touch any ring to shift its color, pulsation speed, and expansion.'
                    : 'Guide the emerald-green photon across contracting liquid-glass rings to weave a luminous three-dimensional lattice.'}
                </p>
              </div>

              {/* Direction Switcher */}
              <div className="pt-3 border-t border-white/[0.07] space-y-2">
                <span className="block text-xs font-medium text-slate-300">
                  Visual Direction
                </span>
                <div
                  role="group"
                  aria-label="Select Simulation Direction"
                  className="grid grid-cols-1 gap-1.5 p-1 rounded-xl bg-[#090816] border border-white/[0.07]"
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      setMode('celestial');
                      e.currentTarget.blur();
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors whitespace-nowrap shrink-0 flex items-center justify-between ${
                      mode === 'celestial'
                        ? 'bg-[#171332] text-amber-100 border border-violet-400/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="font-medium">I. Liquid Light Mandala</span>
                    <span className="font-mono-tabular text-[11px] text-slate-400">[1]</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      setMode('emerald');
                      e.currentTarget.blur();
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors whitespace-nowrap shrink-0 flex items-center justify-between ${
                      mode === 'emerald'
                        ? 'bg-[#071f1a] text-emerald-100 border border-emerald-400/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="font-medium">II. Emerald Photon Lattice</span>
                    <span className="font-mono-tabular text-[11px] text-slate-400">[2]</span>
                  </button>
                </div>
              </div>

              {/* Photon / Comet Path Guidance (Shapes the 3D Lattice) */}
              <div className="pt-3 border-t border-white/[0.07] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    Photon & Comet Path Guidance
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Lattice Weave
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#090816] border border-white/[0.07]">
                  {(
                    [
                      { id: 'orbital', label: 'Orbital Rosette' },
                      { id: 'spiral', label: 'Golden Spiral' },
                      { id: 'triquetra', label: 'Triquetra Knot' },
                      { id: 'cursor', label: 'Cursor / WASD' }
                    ] as const
                  ).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={(e) => {
                        setGuidanceMode(g.id);
                        e.currentTarget.blur();
                      }}
                      className={`py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        guidanceMode === g.id
                          ? mode === 'emerald'
                            ? 'bg-emerald-950/90 text-emerald-100 border border-emerald-400/30'
                            : 'bg-[#191536] text-white border border-white/15'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interactive Concentric Rings Control */}
              <div className="pt-3 border-t border-white/[0.07] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    Interactive Ring Touch Response
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      handleTriggerRingPulse();
                      e.currentTarget.blur();
                    }}
                    className="text-[11px] text-amber-300 hover:text-amber-200 font-medium whitespace-nowrap shrink-0"
                  >
                    Pulse Ring [R]
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#090816] border border-white/[0.07]">
                  {(
                    [
                      { id: 'harmonic', label: 'All Harmonic' },
                      { id: 'color', label: 'Color Shift' },
                      { id: 'pulse', label: 'Pulsation Surge' },
                      { id: 'expand', label: 'Radial Expand' }
                    ] as const
                  ).map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={(e) => {
                        setRingReactionStyle(style.id);
                        e.currentTarget.blur();
                      }}
                      className={`py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        ringReactionStyle === style.id
                          ? 'bg-[#191536] text-amber-100 border border-amber-300/25'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>

                {/* Individual Ring Harmonic Quick-Tap Strip (Rings I..VIII) */}
                <div className="grid grid-cols-8 gap-1 pt-1" role="group" aria-label="Trigger Individual Concentric Ring">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((rIdx) => (
                    <button
                      key={rIdx}
                      type="button"
                      onClick={(e) => {
                        handleTriggerRingPulse(rIdx);
                        e.currentTarget.blur();
                      }}
                      aria-label={`Excite Ring ${rIdx + 1}`}
                      className={`py-1 rounded text-[11px] font-mono-tabular border transition-colors ${
                        telemetry.lastTouchedRing === rIdx + 1
                          ? 'bg-amber-400/20 border-amber-300/50 text-amber-100'
                          : 'bg-[#090816] border-white/10 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {rIdx + 1}
                    </button>
                  ))}
                </div>
              </div>

              {/* Unboxed Live State Readouts (Zero-Pill Discipline) */}
              <div className="pt-3 border-t border-white/[0.07] space-y-2 text-xs">
                <div className="flex items-baseline justify-between">
                  <span className="text-slate-400">Spark Formation</span>
                  <span className="text-slate-200 font-medium">{patternLabel}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-slate-400">3D Lattice Filaments</span>
                  <span data-testid="filament-count" className="text-slate-200 font-mono-tabular">
                    {telemetry.filamentCount} · {telemetry.ringCrossings} crossings
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-slate-400">Interactive Ring Touches</span>
                  <span data-testid="ring-touch-status" className="text-slate-200 font-mono-tabular">
                    {telemetry.ringTouchCount > 0
                      ? `${telemetry.ringTouchCount} (Ring #${telemetry.lastTouchedRing})`
                      : 'Click any ring'}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Quiet Guidance */}
            <div className="pt-3 border-t border-white/[0.07] text-[11px] text-slate-400 space-y-1">
              <p>Click any ring to excite it · Double-click for ×Bloom · Scroll for ring speed.</p>
              <p className="font-mono-tabular text-slate-500">
                Space Pause · R Ring · B Bloom · F Frame · Z Zen
              </p>
            </div>
          </aside>
        )}

        {/* CENTER 9:16 VERTICAL SIMULATION MONOLITH (OR FULL-BLEED RESPONSIVE STAGE) */}
        <section
          aria-label="Vertical 9:16 Simulation Viewport"
          className={`relative overflow-hidden bg-[#03020a] shrink-0 ${
            isFullBleedStage
              ? 'w-full h-full'
              : 'w-full h-full lg:w-auto lg:h-[min(94dvh,900px)] lg:aspect-[9/16] lg:rounded-[28px] lg:border lg:border-white/[0.09] lg:shadow-[0_0_90px_rgba(0,0,0,0.95)]'
          }`}
        >
          {/* 60fps Volumetric Canvas */}
          <HypnoticCanvas
            mode={mode}
            isPaused={isPaused}
            timeScale={timeScale}
            breathIntensity={breathIntensity}
            breathSpeed={breathSpeed}
            guidanceMode={guidanceMode}
            ringReactionStyle={ringReactionStyle}
            forcedPattern={forcedPattern}
            bloomRequestRef={bloomRequestRef}
            ringTouchRequestRef={ringTouchRequestRef}
            clearLatticeRequestRef={clearLatticeRequestRef}
            onTelemetryUpdate={setTelemetry}
            onWheelAdjustSpeed={handleWheelAdjustSpeed}
          />

          {/* IN-VIEWPORT TOP DIEGETIC NUMERAL & PRISMATIC MULTIPLIER BLOOM HUD */}
          <div className="pointer-events-none absolute inset-x-0 top-0 pt-6 sm:pt-7 pb-6 px-6 flex flex-col items-center text-center">
            {mode === 'celestial' ? (
              <>
                <span className="text-[10px] tracking-[0.28em] text-slate-400/80 font-mono-tabular">
                  HARMONIC CYCLE
                </span>
                <div
                  data-testid="primary-counter"
                  className="mt-1 text-6xl sm:text-7xl font-display-thin tracking-[0.08em] text-white/95"
                  style={{
                    textShadow: telemetry.activeMultiplier
                      ? '0 0 38px rgba(251, 191, 36, 0.75), 0 0 76px rgba(157, 78, 221, 0.65)'
                      : '0 0 24px rgba(255, 255, 255, 0.25)'
                  }}
                >
                  {telemetry.countdown}
                </div>
              </>
            ) : (
              <>
                <span className="text-[10px] tracking-[0.28em] text-emerald-300/75 font-mono-tabular">
                  ORBITAL ALIGNMENT RESONANCE
                </span>
                <div
                  data-testid="primary-counter"
                  className="mt-1 text-5xl sm:text-6xl font-display-thin tracking-[0.06em] text-emerald-50/95"
                  style={{
                    textShadow: telemetry.activeMultiplier
                      ? '0 0 36px rgba(52, 211, 153, 0.85), 0 0 72px rgba(56, 189, 248, 0.6)'
                      : '0 0 22px rgba(16, 185, 129, 0.35)'
                  }}
                >
                  {telemetry.latticeScore.toLocaleString()}
                </div>
              </>
            )}

            {/* Prismatic Multiplier Bloom (×7, ×13, ×31) */}
            <div
              data-testid="multiplier-bloom"
              aria-live="polite"
              className="h-12 mt-1 flex flex-col items-center justify-center"
            >
              {telemetry.activeMultiplier && (
                <>
                  <span
                    className="text-2xl sm:text-3xl font-display-thin tracking-[0.14em]"
                    style={{
                      color: mode === 'celestial' ? '#fde68a' : '#6ee7b7',
                      textShadow:
                        mode === 'celestial'
                          ? '0 0 24px rgba(245, 158, 11, 0.9), 0 0 48px rgba(45, 212, 191, 0.8)'
                          : '0 0 24px rgba(16, 185, 129, 0.9), 0 0 48px rgba(56, 189, 248, 0.8)'
                    }}
                  >
                    ×{telemetry.activeMultiplier}
                  </span>
                  <span className="text-[10px] tracking-[0.2em] text-slate-300/90 mt-0.5">
                    {telemetry.bloomReason}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Top-Right Compact Utility Buttons inside Viewport (Frame Toggle & Zen Mode) */}
          <div className="absolute top-4 right-4 sm:top-5 sm:right-5 flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                setIsFullBleedStage((f) => !f);
                e.currentTarget.blur();
              }}
              aria-label={isFullBleedStage ? 'Switch to 9:16 Studio Frame' : 'Expand to Full-Bleed Canvas'}
              title={isFullBleedStage ? '9:16 Studio Monolith [F]' : 'Full-Screen Immersion [F]'}
              className="hidden lg:flex px-3 h-9 rounded-full bg-[#090816]/85 border border-white/15 text-xs text-slate-300 hover:text-white hover:border-white/30 items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <span>{isFullBleedStage ? '9:16 Frame' : 'Full Canvas'}</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                setIsZenMode((z) => !z);
                setIsMobileSheetOpen(false);
                e.currentTarget.blur();
              }}
              aria-label={isZenMode ? 'Exit Zen Mode' : 'Enter Zen Mode'}
              title={isZenMode ? 'Show Controls [Z]' : 'Pure Visual ASMR Zen Mode [Z]'}
              className="w-10 h-10 sm:w-9 sm:h-9 rounded-full bg-[#090816]/85 border border-white/15 text-slate-300 hover:text-white hover:border-white/30 flex items-center justify-center transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.6">
                {isZenMode ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                )}
              </svg>
            </button>
          </div>

          {/* SLIDE-UP RESPONSIVE CONTROL DRAWER (Mobile, Tablet, and Full-Bleed Desktop Mode) */}
          {!isZenMode && isMobileSheetOpen && (
            <section
              aria-label="Responsive Simulation Studio Controls"
              className="absolute inset-x-3 bottom-18 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[460px] p-4 rounded-2xl bg-[#070613]/95 border border-white/15 shadow-2xl space-y-3.5 z-20"
            >
              {/* Drawer Header & Tab Switcher */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0d0b1e]">
                  {(
                    [
                      { id: 'motion', label: 'Path & Speed' },
                      { id: 'rings', label: 'Rings & Sparks' },
                      { id: 'audio', label: 'Soundscape' }
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setMobileTab(t.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                        mobileTab === t.id ? 'bg-[#1c173d] text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileSheetOpen(false)}
                  aria-label="Close Controls Drawer"
                  className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                >
                  Done
                </button>
              </div>

              {/* TAB 1: Path Guidance & Ring Contraction/Expansion Speed */}
              {mobileTab === 'motion' && (
                <div className="space-y-3">
                  <div>
                    <span className="block text-xs text-slate-300 mb-1.5">
                      Photon & Comet Path Guidance
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { id: 'orbital', label: 'Orbital Rosette' },
                          { id: 'spiral', label: 'Golden Spiral' },
                          { id: 'triquetra', label: 'Triquetra Knot' },
                          { id: 'cursor', label: 'Cursor / Touch' }
                        ] as const
                      ).map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setGuidanceMode(g.id)}
                          className={`py-2 px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border ${
                            guidanceMode === g.id
                              ? 'bg-[#191536] text-white border-violet-400/40'
                              : 'bg-[#0c0a1d] text-slate-400 border-white/10'
                          }`}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <label htmlFor="m-slider-speed" className="text-slate-300">
                          Ring Contraction Speed
                        </label>
                        <span className="font-mono-tabular text-slate-400">{breathSpeed.toFixed(1)}×</span>
                      </div>
                      <input
                        id="m-slider-speed"
                        type="range"
                        min="0.2"
                        max="2.5"
                        step="0.1"
                        value={breathSpeed}
                        onChange={(e) => setBreathSpeed(parseFloat(e.target.value))}
                        className="w-full accent-emerald-400"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <label htmlFor="m-slider-depth" className="text-slate-300">
                          Breathing Amplitude
                        </label>
                        <span className="font-mono-tabular text-slate-400">
                          {Math.round(breathIntensity * 100)}%
                        </span>
                      </div>
                      <input
                        id="m-slider-depth"
                        type="range"
                        min="0.2"
                        max="2.0"
                        step="0.1"
                        value={breathIntensity}
                        onChange={(e) => setBreathIntensity(parseFloat(e.target.value))}
                        className="w-full accent-violet-400"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: Interactive Rings, Spark Coalescence & Multiplier Blooms */}
              {mobileTab === 'rings' && (
                <div className="space-y-3">
                  <div>
                    <span className="block text-xs text-slate-300 mb-1.5">
                      Interactive Ring Touch Reaction
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { id: 'harmonic', label: 'All Harmonic' },
                          { id: 'color', label: 'Color Shift' },
                          { id: 'pulse', label: 'Pulsation Surge' },
                          { id: 'expand', label: 'Radial Expand' }
                        ] as const
                      ).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setRingReactionStyle(s.id)}
                          className={`py-2 px-2.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border ${
                            ringReactionStyle === s.id
                              ? 'bg-[#191536] text-amber-100 border-amber-400/40'
                              : 'bg-[#0c0a1d] text-slate-400 border-white/10'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="block text-xs text-slate-300 mb-1.5">
                      Spark Coalescence Pattern
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { id: 'auto', label: 'Auto Cycle' },
                          { id: 'mandala', label: 'Sacred Mandala' },
                          { id: 'galaxy', label: 'Spiral Galaxy' },
                          { id: 'scatter', label: 'Free Comet Wake' }
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setForcedPattern(item.id)}
                          className={`py-2 px-2.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border ${
                            forcedPattern === item.id
                              ? 'bg-[#191536] text-white border-white/25'
                              : 'bg-[#0c0a1d] text-slate-400 border-white/10'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: Generative Ambient Soundscape Mixer */}
              {mobileTab === 'audio' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300">
                      Generative Ambient Soundscape ({telemetry.ringFilterHz}Hz · {telemetry.cometPitchHz}Hz)
                    </span>
                    <button
                      type="button"
                      onClick={handleToggleAudio}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                        !isMuted
                          ? 'bg-teal-950/90 border-teal-400/40 text-teal-100'
                          : 'bg-[#110f24] border-white/15 text-slate-300'
                      }`}
                    >
                      {isMuted ? 'Enable Sound' : 'Sound Active'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Deep Ring Pulse Tone</span>
                        <span className="font-mono-tabular">{Math.round(audioMix.ringPulseLevel * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={audioMix.ringPulseLevel}
                        onChange={(e) => handleMixChange({ ringPulseLevel: parseFloat(e.target.value) })}
                        className="w-full accent-violet-400"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Comet-Core Ethereal Hum</span>
                        <span className="font-mono-tabular">{Math.round(audioMix.cometHumLevel * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={audioMix.cometHumLevel}
                        onChange={(e) => handleMixChange({ cometHumLevel: parseFloat(e.target.value) })}
                        className="w-full accent-amber-400"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Dust & Spark Shimmer</span>
                        <span className="font-mono-tabular">{Math.round(audioMix.shimmerLevel * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={audioMix.shimmerLevel}
                        onChange={(e) => handleMixChange({ shimmerLevel: parseFloat(e.target.value) })}
                        className="w-full accent-teal-400"
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* PERSISTENT COMPACT BOTTOM BAR (Mobile, Tablet, and Full-Bleed Desktop Mode — <= 10% height) */}
          {!isZenMode && (
            <div
              className={`${
                isFullBleedStage ? 'flex' : 'flex lg:hidden'
              } absolute inset-x-3 bottom-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-[#070612]/90 border border-white/12 z-10`}
            >
              <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[#0d0b1e] border border-white/10">
                <button
                  type="button"
                  onClick={() => setMode('celestial')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    mode === 'celestial' ? 'bg-violet-950/90 text-amber-100' : 'text-slate-400'
                  }`}
                >
                  Liquid Light
                </button>
                <button
                  type="button"
                  onClick={() => setMode('emerald')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    mode === 'emerald' ? 'bg-emerald-950/90 text-emerald-100' : 'text-slate-400'
                  }`}
                >
                  Emerald Lattice
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleTriggerRingPulse()}
                  className="px-2.5 py-2 rounded-xl bg-[#15122b] border border-violet-400/30 text-violet-200 text-xs font-medium whitespace-nowrap shrink-0"
                >
                  Pulse Ring
                </button>
                <button
                  type="button"
                  onClick={() => handleTriggerBloom()}
                  className="px-2.5 py-2 rounded-xl bg-[#15122b] border border-amber-400/30 text-amber-200 text-xs font-medium whitespace-nowrap shrink-0"
                >
                  Bloom ×
                </button>
                <button
                  type="button"
                  onClick={() => setIsMobileSheetOpen((o) => !o)}
                  aria-expanded={isMobileSheetOpen}
                  className={`px-3 py-2 rounded-xl border text-xs font-medium whitespace-nowrap shrink-0 ${
                    isMobileSheetOpen
                      ? 'bg-white text-slate-950 border-white'
                      : 'bg-[#110f24] border-white/15 text-slate-200'
                  }`}
                >
                  Tune & Sound
                </button>
              </div>
            </div>
          )}
        </section>

        {/* RIGHT COLUMN (Desktop Only, when in 9:16 Studio Frame & not Zen): Ring Speed, Coalescence & Generative Soundscape */}
        {!isZenMode && !isFullBleedStage && (
          <aside
            aria-label="Simulation Controls and Generative Soundscape"
            className="hidden lg:flex flex-col justify-between w-76 h-[min(92dvh,880px)] py-3 shrink-0"
          >
            <div className="space-y-4">
              {/* Prismatic Multiplier Triggers */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    Prismatic Multiplier Bloom
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono-tabular">
                    Auto / Manual
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {MULTIPLIER_SEQUENCE.map((mult) => (
                    <button
                      key={mult}
                      type="button"
                      onClick={(e) => {
                        handleTriggerBloom(mult);
                        e.currentTarget.blur();
                      }}
                      className="py-1.5 px-3 rounded-lg bg-[#0c0a1d] hover:bg-[#161332] border border-white/10 hover:border-amber-300/40 text-xs font-mono-tabular text-slate-200 transition-colors whitespace-nowrap shrink-0"
                    >
                      Bloom ×{mult}
                    </button>
                  ))}
                </div>
              </div>

              {/* Spark Coalescence Formation Selector */}
              <div className="pt-3 border-t border-white/[0.07] space-y-2">
                <span className="block text-xs font-medium text-slate-300">
                  Crystalline Spark Coalescence
                </span>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#090816] border border-white/[0.07]">
                  {(
                    [
                      { id: 'auto', label: 'Auto Cycle' },
                      { id: 'mandala', label: 'Sacred Mandala' },
                      { id: 'galaxy', label: 'Spiral Galaxy' },
                      { id: 'scatter', label: 'Free Comet Wake' }
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={(e) => {
                        setForcedPattern(item.id);
                        e.currentTarget.blur();
                      }}
                      className={`py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        forcedPattern === item.id
                          ? 'bg-[#191536] text-white border border-white/15'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ring Contraction & Expansion Speed + Depth Sliders */}
              <div className="pt-3 border-t border-white/[0.07] space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <label htmlFor="slider-breath-speed" className="text-slate-300">
                      Ring Contraction & Expansion Speed
                    </label>
                    <span className="font-mono-tabular text-slate-400">
                      {breathSpeed.toFixed(1)}×
                    </span>
                  </div>
                  <input
                    id="slider-breath-speed"
                    type="range"
                    min="0.2"
                    max="2.5"
                    step="0.1"
                    value={breathSpeed}
                    onChange={(e) => setBreathSpeed(parseFloat(e.target.value))}
                    className="w-full accent-emerald-400 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <label htmlFor="slider-breath-depth" className="text-slate-300">
                      Ring Breathing Amplitude
                    </label>
                    <span className="font-mono-tabular text-slate-400">
                      {Math.round(breathIntensity * 100)}%
                    </span>
                  </div>
                  <input
                    id="slider-breath-depth"
                    type="range"
                    min="0.2"
                    max="2.0"
                    step="0.1"
                    value={breathIntensity}
                    onChange={(e) => setBreathIntensity(parseFloat(e.target.value))}
                    className="w-full accent-violet-400 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <label htmlFor="slider-timescale" className="text-slate-300">
                      Temporal Flow Rate
                    </label>
                    <span className="font-mono-tabular text-slate-400">
                      {timeScale.toFixed(1)}×
                    </span>
                  </div>
                  <input
                    id="slider-timescale"
                    type="range"
                    min="0.3"
                    max="2.2"
                    step="0.1"
                    value={timeScale}
                    onChange={(e) => setTimeScale(parseFloat(e.target.value))}
                    className="w-full accent-teal-400 cursor-pointer"
                  />
                </div>
              </div>

              {/* Dynamic Generative Ambient Soundscape Controls */}
              <div className="pt-3 border-t border-white/[0.07] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    Generative Ambient Soundscape
                  </span>
                  <span className="text-[11px] font-mono-tabular text-slate-400">
                    {telemetry.ringFilterHz}Hz · {telemetry.cometPitchHz}Hz
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      handleToggleAudio();
                      e.currentTarget.blur();
                    }}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      !isMuted
                        ? 'bg-teal-950/80 border-teal-400/40 text-teal-100'
                        : 'bg-[#0d0b20] hover:bg-[#171436] border-white/10 text-slate-200'
                    }`}
                  >
                    {isMuted ? 'Enable Soundscape' : 'Soundscape Active'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      setIsPaused((p) => !p);
                      e.currentTarget.blur();
                    }}
                    className="py-2 px-3 rounded-lg bg-[#0d0b20] hover:bg-[#171436] border border-white/10 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0"
                  >
                    {isPaused ? 'Resume Flow' : 'Pause Flow'}
                  </button>
                </div>

                <div className="space-y-2 pt-1">
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-0.5">
                      <label htmlFor="slider-audio-rings">Deep Ring Pulse Tone</label>
                      <span className="font-mono-tabular">{Math.round(audioMix.ringPulseLevel * 100)}%</span>
                    </div>
                    <input
                      id="slider-audio-rings"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={audioMix.ringPulseLevel}
                      onChange={(e) => handleMixChange({ ringPulseLevel: parseFloat(e.target.value) })}
                      className="w-full accent-violet-400 cursor-pointer h-1"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-0.5">
                      <label htmlFor="slider-audio-comet">Comet-Core Ethereal Hum</label>
                      <span className="font-mono-tabular">{Math.round(audioMix.cometHumLevel * 100)}%</span>
                    </div>
                    <input
                      id="slider-audio-comet"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={audioMix.cometHumLevel}
                      onChange={(e) => handleMixChange({ cometHumLevel: parseFloat(e.target.value) })}
                      className="w-full accent-amber-400 cursor-pointer h-1"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-0.5">
                      <label htmlFor="slider-audio-shimmer">Dust & Spark Shimmer</label>
                      <span className="font-mono-tabular">{Math.round(audioMix.shimmerLevel * 100)}%</span>
                    </div>
                    <input
                      id="slider-audio-shimmer"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={audioMix.shimmerLevel}
                      onChange={(e) => handleMixChange({ shimmerLevel: parseFloat(e.target.value) })}
                      className="w-full accent-teal-400 cursor-pointer h-1"
                    />
                  </div>
                </div>

                {mode === 'emerald' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      handleResetLattice();
                      e.currentTarget.blur();
                    }}
                    className="w-full py-1.5 px-3 rounded-lg bg-[#091815] hover:bg-[#0e2621] border border-emerald-500/25 text-xs text-emerald-200 transition-colors whitespace-nowrap shrink-0"
                  >
                    Clear Woven Lattice Filaments
                  </button>
                )}
              </div>
            </div>

            {/* Palette Legend */}
            <div className="pt-3 border-t border-white/[0.07] text-xs text-slate-400 flex items-center justify-between">
              <span>Spectrum</span>
              <span className="text-slate-300">
                {mode === 'celestial'
                  ? 'Violet · Molten Gold · Icy Teal'
                  : 'Emerald Photon · Liquid Glass'}
              </span>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
