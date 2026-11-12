import React, { useEffect, useRef } from 'react';
import {
  CoalescencePattern,
  CELESTIAL_PALETTE,
  EMERALD_PALETTE,
  LatticeFilament,
  MultiplierValue,
  PhotonGuidanceMode,
  RingReactionStyle,
  RingState,
  SimulationMode,
  clamp,
  computeAudioModulation,
  computeBodyPosition,
  computeCoalescenceTarget,
  computeCountdownValue,
  createInitialRings,
  detectRingCrossing,
  findNearestRingIndex,
  getMultiplierForStep,
  sampleCelestialTriadColor,
  stepRings,
  triggerRingInteraction,
  weaveLatticeFilament
} from '../sim/engine';
import { soundEngine } from '../sim/audio';

export interface SimHudTelemetry {
  countdown: number;
  latticeScore: number;
  activeMultiplier: MultiplierValue | null;
  bloomReason: string;
  bloomIntensity: number;
  activePattern: CoalescencePattern;
  filamentCount: number;
  ringCrossings: number;
  lastTouchedRing: number | null;
  ringTouchCount: number;
  ringFilterHz: number;
  cometPitchHz: number;
}

interface TouchWaveRipple {
  xNorm: number;
  yNorm: number;
  radiusNorm: number;
  alpha: number;
  r: number;
  g: number;
  b: number;
}

interface HypnoticCanvasProps {
  mode: SimulationMode;
  isPaused: boolean;
  timeScale: number;
  breathIntensity: number;
  breathSpeed: number;
  guidanceMode: PhotonGuidanceMode;
  ringReactionStyle: RingReactionStyle;
  forcedPattern: CoalescencePattern | 'auto';
  bloomRequestRef: React.MutableRefObject<MultiplierValue | null>;
  ringTouchRequestRef: React.MutableRefObject<number | null>;
  clearLatticeRequestRef: React.MutableRefObject<boolean>;
  onTelemetryUpdate: (telemetry: SimHudTelemetry) => void;
  onWheelAdjustSpeed?: (delta: number) => void;
}

const DUST_COUNT = 150;
const SPARK_POOL_SIZE = 280;
const TRAIL_HISTORY_LEN = 60;

/**
 * Generates an offscreen soft radial volumetric glow sprite so particles and comet cores
 * render with zero hard edges and silky additive luminescence.
 */
function createGlowSprite(
  size: number,
  r: number,
  g: number,
  b: number,
  coreWhite = 0.7
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);

  const cr = Math.round(r + (255 - r) * coreWhite);
  const cg = Math.round(g + (255 - g) * coreWhite);
  const cb = Math.round(b + (255 - b) * coreWhite);

  grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 1)`);
  grad.addColorStop(0.18, `rgba(${r}, ${g}, ${b}, 0.82)`);
  grad.addColorStop(0.48, `rgba(${r}, ${g}, ${b}, 0.26)`);
  grad.addColorStop(0.78, `rgba(${r}, ${g}, ${b}, 0.05)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return c;
}

export const HypnoticCanvas: React.FC<HypnoticCanvasProps> = ({
  mode,
  isPaused,
  timeScale,
  breathIntensity,
  breathSpeed,
  guidanceMode,
  ringReactionStyle,
  forcedPattern,
  bloomRequestRef,
  ringTouchRequestRef,
  clearLatticeRequestRef,
  onTelemetryUpdate,
  onWheelAdjustSpeed
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const propsRef = useRef({
    mode,
    isPaused,
    timeScale,
    breathIntensity,
    breathSpeed,
    guidanceMode,
    ringReactionStyle,
    forcedPattern,
    onTelemetryUpdate,
    onWheelAdjustSpeed
  });
  useEffect(() => {
    propsRef.current = {
      mode,
      isPaused,
      timeScale,
      breathIntensity,
      breathSpeed,
      guidanceMode,
      ringReactionStyle,
      forcedPattern,
      onTelemetryUpdate,
      onWheelAdjustSpeed
    };
  }, [
    mode,
    isPaused,
    timeScale,
    breathIntensity,
    breathSpeed,
    guidanceMode,
    ringReactionStyle,
    forcedPattern,
    onTelemetryUpdate,
    onWheelAdjustSpeed
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const isHeadless = typeof navigator !== 'undefined' && navigator.webdriver === true;

    // Pre-render volumetric glow sprites
    const sprites = {
      whiteGold: createGlowSprite(96, 255, 226, 160, 0.9),
      violet: createGlowSprite(
        64,
        CELESTIAL_PALETTE.violet.r,
        CELESTIAL_PALETTE.violet.g,
        CELESTIAL_PALETTE.violet.b,
        0.5
      ),
      gold: createGlowSprite(
        64,
        CELESTIAL_PALETTE.gold.r,
        CELESTIAL_PALETTE.gold.g,
        CELESTIAL_PALETTE.gold.b,
        0.65
      ),
      teal: createGlowSprite(
        64,
        CELESTIAL_PALETTE.teal.r,
        CELESTIAL_PALETTE.teal.g,
        CELESTIAL_PALETTE.teal.b,
        0.6
      ),
      emeraldCore: createGlowSprite(
        112,
        EMERALD_PALETTE.emeraldCore.r,
        EMERALD_PALETTE.emeraldCore.g,
        EMERALD_PALETTE.emeraldCore.b,
        0.85
      ),
      emeraldSpark: createGlowSprite(
        56,
        EMERALD_PALETTE.emeraldGlow.r,
        EMERALD_PALETTE.emeraldGlow.g,
        EMERALD_PALETTE.emeraldGlow.b,
        0.6
      ),
      silverDust: createGlowSprite(36, 210, 225, 255, 0.4)
    };

    // Simulation state
    let simTime = 0;
    let countdownElapsed = 0;
    const rings: RingState[] = createInitialRings(8);
    let filaments: LatticeFilament[] = [];
    const touchRipples: TouchWaveRipple[] = [];
    let latticeScore = 144;
    let ringCrossings = 0;
    let ringTouchCount = 0;
    let lastTouchedRing: number | null = null;
    let multiplierStepIdx = 0;

    // Active Multiplier Bloom state
    let activeMultiplier: MultiplierValue | null = null;
    let bloomIntensity = 0;
    let bloomReason = 'Harmonic Resonance';
    let lastAutoBloomSecond = -1;

    // Pre-seed initial lattice filaments so Emerald mode looks immediately architectural and rich
    const seedPos1 = computeBodyPosition(1.2, 'emerald');
    filaments = weaveLatticeFilament(filaments, rings[1], seedPos1, 0.5);
    const seedPos2 = computeBodyPosition(2.4, 'emerald');
    filaments = weaveLatticeFilament(filaments, rings[3], seedPos2, 1.0);
    const seedPos3 = computeBodyPosition(3.6, 'emerald');
    filaments = weaveLatticeFilament(filaments, rings[5], seedPos3, 1.5);

    // Zero-GC Typed Array Pool: Silver Void Dust
    const dustX = new Float32Array(DUST_COUNT);
    const dustY = new Float32Array(DUST_COUNT);
    const dustZ = new Float32Array(DUST_COUNT);
    const dustPhase = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i++) {
      dustX[i] = Math.random() * 2 - 1;
      dustY[i] = Math.random() * 2 - 1;
      dustZ[i] = 0.25 + Math.random() * 0.75;
      dustPhase[i] = Math.random() * Math.PI * 2;
    }

    // Zero-GC Typed Array Pool: Crystalline Comet Sparks
    const sparkX = new Float32Array(SPARK_POOL_SIZE);
    const sparkY = new Float32Array(SPARK_POOL_SIZE);
    const sparkVX = new Float32Array(SPARK_POOL_SIZE);
    const sparkVY = new Float32Array(SPARK_POOL_SIZE);
    const sparkLife = new Float32Array(SPARK_POOL_SIZE);
    const sparkMaxLife = new Float32Array(SPARK_POOL_SIZE);
    const sparkSize = new Float32Array(SPARK_POOL_SIZE);
    const sparkColorType = new Uint8Array(SPARK_POOL_SIZE);
    let sparkCursor = 0;

    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
      const histT = -((i / SPARK_POOL_SIZE) * 6.0);
      const p = computeBodyPosition(histT, 'celestial');
      const jitterAngle = i * 2.39996;
      const jitterR = (i % 17) * 0.008;
      sparkX[i] = p.x + Math.cos(jitterAngle) * jitterR;
      sparkY[i] = p.y + Math.sin(jitterAngle) * jitterR;
      sparkVX[i] = (Math.random() - 0.5) * 0.06;
      sparkVY[i] = (Math.random() - 0.5) * 0.06;
      sparkMaxLife[i] = 4.5 + (i % 5) * 0.8;
      sparkLife[i] = (i / SPARK_POOL_SIZE) * sparkMaxLife[i];
      sparkSize[i] = 0.55 + (i % 7) * 0.16;
      sparkColorType[i] = (i % 4) as 0 | 1 | 2 | 3;
    }

    // Comet / Photon Ribbon Trail Ring Buffer
    const trailX = new Float32Array(TRAIL_HISTORY_LEN);
    const trailY = new Float32Array(TRAIL_HISTORY_LEN);
    const initPos = computeBodyPosition(0, 'celestial');
    for (let i = 0; i < TRAIL_HISTORY_LEN; i++) {
      const backP = computeBodyPosition(-i * 0.025, 'celestial');
      trailX[i] = backP.x;
      trailY[i] = backP.y;
    }
    let prevRadialDistNorm = Math.hypot(initPos.x, initPos.y);

    // Pointer & Keyboard interactive guidance state
    let pointerXNorm: number | null = null;
    let pointerYNorm: number | null = null;
    let pointerRadialDistNorm: number | null = null;
    let pointerStrength = 0;
    let isPointerDown = false;
    let manualTargetX = 0;
    let manualTargetY = 0;
    let lastTapTime = 0;
    const keysHeld = new Set<string>();

    const triggerBloom = (mult: MultiplierValue, reason: string) => {
      activeMultiplier = mult;
      bloomIntensity = 1.0;
      bloomReason = reason;
      latticeScore = Math.min(9999999, latticeScore * mult);
      for (let i = 0; i < rings.length; i++) {
        rings[i].resonanceGlow = 1.0;
      }
      soundEngine.playMultiplierBloom(mult, propsRef.current.mode);
    };

    const emitRingSparkRipple = (ringIdx: number, touchAngle?: number) => {
      const rNorm = rings[ringIdx].currentRadiusNorm;
      const count = 18;
      for (let b = 0; b < count; b++) {
        const idx = sparkCursor;
        sparkCursor = (sparkCursor + 1) % SPARK_POOL_SIZE;
        const theta =
          touchAngle !== undefined
            ? touchAngle + (b / count - 0.5) * Math.PI * 1.1
            : (b / count) * Math.PI * 2 + simTime;
        sparkX[idx] = Math.cos(theta) * rNorm;
        sparkY[idx] = Math.sin(theta) * rNorm;
        sparkVX[idx] = Math.cos(theta) * 0.11;
        sparkVY[idx] = Math.sin(theta) * 0.11;
        sparkMaxLife[idx] = 3.8 + Math.random() * 2.0;
        sparkLife[idx] = sparkMaxLife[idx];
        sparkSize[idx] = 0.8 + Math.random() * 0.65;
        sparkColorType[idx] = ((ringIdx + b) % 4) as 0 | 1 | 2 | 3;
      }
    };

    const handleRingInteractAt = (ringIdx: number, touchAngle?: number, touchX = 0, touchY = 0) => {
      if (ringIdx < 0 || ringIdx >= rings.length) return;
      const { ringReactionStyle: style, mode: curMode } = propsRef.current;
      triggerRingInteraction(rings, ringIdx, style);
      ringTouchCount++;
      lastTouchedRing = ringIdx + 1;
      latticeScore += 24 * (activeMultiplier || 1);
      emitRingSparkRipple(ringIdx, touchAngle);
      soundEngine.playRingTouch(ringIdx, curMode, style);

      // Add visual shockwave ripple at touch location
      const triad = sampleCelestialTriadColor(rings[ringIdx].colorPhase + rings[ringIdx].touchColorShift, 0.3);
      touchRipples.push({
        xNorm: touchX,
        yNorm: touchY,
        radiusNorm: 0.02,
        alpha: 0.85,
        r: curMode === 'celestial' ? triad.r : 52,
        g: curMode === 'celestial' ? triad.g : 211,
        b: curMode === 'celestial' ? triad.b : 153
      });
      if (touchRipples.length > 8) touchRipples.shift();

      if (curMode === 'emerald') {
        const theta = touchAngle !== undefined ? touchAngle : rings[ringIdx].rotationAngle;
        const ringPt = {
          x: Math.cos(theta) * rings[ringIdx].currentRadiusNorm,
          y: Math.sin(theta) * rings[ringIdx].currentRadiusNorm,
          z: Math.sin(simTime + ringIdx) * 0.4
        };
        filaments = weaveLatticeFilament(filaments, rings[ringIdx], ringPt, simTime, 96);
      }
    };

    const updatePointerFromEvent = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.53;
      const scale = Math.min(rect.width, rect.height) * 0.44;
      pointerXNorm = clamp((clientX - cx) / scale, -0.98, 0.98);
      pointerYNorm = clamp((clientY - cy) / scale, -1.4, 1.4);
      pointerRadialDistNorm = Math.hypot(pointerXNorm, pointerYNorm);
      manualTargetX = pointerXNorm;
      manualTargetY = pointerYNorm;
    };

    const onPointerMove = (e: PointerEvent) => {
      updatePointerFromEvent(e.clientX, e.clientY);
      pointerStrength = Math.max(pointerStrength, isPointerDown ? 0.95 : 0.48);
    };

    const onPointerDown = (e: PointerEvent) => {
      isPointerDown = true;
      updatePointerFromEvent(e.clientX, e.clientY);
      pointerStrength = 0.96;

      // Double-tap / double-click triggers a Prismatic Multiplier Bloom
      const nowMs = performance.now();
      if (nowMs - lastTapTime < 300) {
        const mult = getMultiplierForStep(multiplierStepIdx++);
        triggerBloom(mult, 'Harmonic Double-Tap Bloom');
      }
      lastTapTime = nowMs;

      if (pointerRadialDistNorm !== null && pointerXNorm !== null && pointerYNorm !== null) {
        const nearestIdx = findNearestRingIndex(rings, pointerRadialDistNorm, 0.12);
        if (nearestIdx !== -1) {
          const touchAngle = Math.atan2(pointerYNorm, pointerXNorm);
          handleRingInteractAt(nearestIdx, touchAngle, pointerXNorm, pointerYNorm);
        }
      }
    };

    const onPointerUp = () => {
      isPointerDown = false;
    };

    const onPointerLeave = () => {
      isPointerDown = false;
      pointerXNorm = null;
      pointerYNorm = null;
      pointerRadialDistNorm = null;
    };

    const onWheel = (e: WheelEvent) => {
      if (propsRef.current.onWheelAdjustSpeed) {
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        propsRef.current.onWheelAdjustSpeed(delta);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(
          e.code
        )
      ) {
        keysHeld.add(e.code);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysHeld.delete(e.code);
    };
    const onWindowBlur = () => {
      keysHeld.clear();
      isPointerDown = false;
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);

    // ResizeObserver for crisp DPR-aware rendering across mobile, tablet, and desktop
    let viewWidth = 540;
    let viewHeight = 960;
    let celestialBgGrad: CanvasGradient | null = null;
    let emeraldBgGrad: CanvasGradient | null = null;

    const rebuildBackdrops = () => {
      const cx = viewWidth * 0.5;
      const cy = viewHeight * 0.53;
      const baseScale = Math.min(viewWidth, viewHeight) * 0.44;

      celestialBgGrad = ctx.createRadialGradient(
        cx,
        cy,
        baseScale * 0.05,
        cx,
        cy,
        Math.max(viewWidth, viewHeight) * 0.85
      );
      celestialBgGrad.addColorStop(0, '#110c2e');
      celestialBgGrad.addColorStop(0.52, '#080619');
      celestialBgGrad.addColorStop(1, '#03020a');

      emeraldBgGrad = ctx.createRadialGradient(
        cx,
        cy,
        baseScale * 0.04,
        cx,
        cy,
        Math.max(viewWidth, viewHeight) * 0.8
      );
      emeraldBgGrad.addColorStop(0, '#03120f');
      emeraldBgGrad.addColorStop(0.6, '#020505');
      emeraldBgGrad.addColorStop(1, '#010203');
    };

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = isHeadless ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);
      viewWidth = Math.round(rect.width);
      viewHeight = Math.round(rect.height);
      canvas.width = Math.round(viewWidth * dpr);
      canvas.height = Math.round(viewHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rebuildBackdrops();
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(canvas);

    let lastFrameTime = performance.now();
    let lastHudUpdate = 0;
    let rafId = 0;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let isDisposed = false;

    const renderLoop = (now: number) => {
      if (isDisposed) return;

      const rawDt = (now - lastFrameTime) / 1000;
      lastFrameTime = now;

      const {
        mode: currentMode,
        isPaused: paused,
        timeScale: speed,
        breathIntensity: breathDepth,
        breathSpeed: ringBreathSpeed,
        guidanceMode: currentGuidance,
        forcedPattern,
        onTelemetryUpdate: emitHud
      } = propsRef.current;

      if (clearLatticeRequestRef.current) {
        clearLatticeRequestRef.current = false;
        filaments = [];
        latticeScore = 144;
      }

      if (ringTouchRequestRef.current !== null) {
        const targetRing = ringTouchRequestRef.current;
        ringTouchRequestRef.current = null;
        const rNorm = rings[targetRing]?.currentRadiusNorm ?? 0.4;
        const angle = rings[targetRing]?.rotationAngle ?? 0;
        handleRingInteractAt(targetRing, angle, Math.cos(angle) * rNorm, Math.sin(angle) * rNorm);
      }

      if (bloomRequestRef.current !== null) {
        const requestedMult = bloomRequestRef.current;
        bloomRequestRef.current = null;
        triggerBloom(
          requestedMult,
          currentMode === 'celestial' ? 'Prismatic Harmonic Bloom' : 'Perfect Orbital Alignment'
        );
      }

      const dt = paused ? 0 : clamp(rawDt, 0.001, 0.05) * speed;
      simTime += dt;
      countdownElapsed += paused ? 0 : clamp(rawDt, 0.001, 0.05) * Math.max(0.5, speed);

      if (keysHeld.size > 0 && !paused) {
        const steerSpeed = 0.65 * clamp(rawDt, 0.001, 0.05);
        if (keysHeld.has('ArrowLeft') || keysHeld.has('KeyA'))
          manualTargetX = clamp(manualTargetX - steerSpeed, -0.88, 0.88);
        if (keysHeld.has('ArrowRight') || keysHeld.has('KeyD'))
          manualTargetX = clamp(manualTargetX + steerSpeed, -0.88, 0.88);
        if (keysHeld.has('ArrowUp') || keysHeld.has('KeyW'))
          manualTargetY = clamp(manualTargetY - steerSpeed, -0.88, 0.88);
        if (keysHeld.has('ArrowDown') || keysHeld.has('KeyS'))
          manualTargetY = clamp(manualTargetY + steerSpeed, -0.88, 0.88);
        pointerStrength = Math.max(pointerStrength, 0.85);
      } else if (pointerXNorm === null) {
        pointerStrength = Math.max(0, pointerStrength - clamp(rawDt, 0.001, 0.05) * 0.8);
      }

      if (bloomIntensity > 0) {
        bloomIntensity = Math.max(0, bloomIntensity - clamp(rawDt, 0.001, 0.05) * 0.28);
        if (bloomIntensity < 0.02) {
          activeMultiplier = null;
        }
      }

      const currentCountdown = computeCountdownValue(countdownElapsed, 240);

      if (
        !paused &&
        currentCountdown < 240 &&
        currentCountdown % 14 === 0 &&
        currentCountdown !== lastAutoBloomSecond
      ) {
        lastAutoBloomSecond = currentCountdown;
        const mult = getMultiplierForStep(multiplierStepIdx++);
        triggerBloom(
          mult,
          currentMode === 'celestial' ? 'Celestial Convergence' : 'Orbital Resonance Lock'
        );
      }

      let currentPattern: CoalescencePattern = 'scatter';
      let coalescenceFactor = 0;
      if (forcedPattern !== 'auto') {
        currentPattern = forcedPattern;
        coalescenceFactor = forcedPattern === 'scatter' ? 0 : 0.88;
      } else {
        const cyclePeriod = 22.0;
        const phaseInCycle = simTime % cyclePeriod;
        if (phaseInCycle > 5.0 && phaseInCycle < 11.5) {
          currentPattern = 'mandala';
          coalescenceFactor = Math.sin(((phaseInCycle - 5.0) / 6.5) * Math.PI) * 0.88;
        } else if (phaseInCycle > 14.5 && phaseInCycle < 21.0) {
          currentPattern = 'galaxy';
          coalescenceFactor = Math.sin(((phaseInCycle - 14.5) / 6.5) * Math.PI) * 0.88;
        }
      }

      const { alignedPairCount } = stepRings(
        rings,
        dt,
        simTime,
        breathDepth,
        bloomIntensity,
        ringBreathSpeed,
        pointerRadialDistNorm
      );
      if (!paused && currentMode === 'emerald' && alignedPairCount >= 3 && bloomIntensity <= 0.05) {
        const mult = getMultiplierForStep(multiplierStepIdx++);
        triggerBloom(mult, 'Perfect Orbital Alignment');
      }

      const activeSteerX =
        pointerXNorm !== null ? pointerXNorm : keysHeld.size > 0 ? manualTargetX : null;
      const activeSteerY =
        pointerYNorm !== null ? pointerYNorm : keysHeld.size > 0 ? manualTargetY : null;

      const bodyPos = computeBodyPosition(
        simTime,
        currentMode,
        activeSteerX,
        activeSteerY,
        pointerStrength,
        currentGuidance,
        manualTargetX,
        manualTargetY
      );
      const currRadialDistNorm = Math.hypot(bodyPos.x, bodyPos.y);

      if (!paused) {
        const crossedRingIdx = detectRingCrossing(
          rings,
          prevRadialDistNorm,
          currRadialDistNorm,
          simTime
        );
        if (crossedRingIdx !== -1) {
          rings[crossedRingIdx].lastPassTime = simTime;
          rings[crossedRingIdx].resonanceGlow = 1.0;
          ringCrossings++;
          latticeScore += 12 * (activeMultiplier || 1);
          soundEngine.playRingPassage(crossedRingIdx, currentMode);

          filaments = weaveLatticeFilament(filaments, rings[crossedRingIdx], bodyPos, simTime, 96);

          for (let b = 0; b < 8; b++) {
            const idx = sparkCursor;
            sparkCursor = (sparkCursor + 1) % SPARK_POOL_SIZE;
            const burstAngle = (b / 8) * Math.PI * 2 + simTime;
            sparkX[idx] = bodyPos.x;
            sparkY[idx] = bodyPos.y;
            sparkVX[idx] = Math.cos(burstAngle) * 0.14;
            sparkVY[idx] = Math.sin(burstAngle) * 0.14;
            sparkMaxLife[idx] = 4.2 + Math.random() * 2.2;
            sparkLife[idx] = sparkMaxLife[idx];
            sparkSize[idx] = 0.75 + Math.random() * 0.65;
            sparkColorType[idx] = (crossedRingIdx % 4) as 0 | 1 | 2 | 3;
          }
        }
      }
      prevRadialDistNorm = currRadialDistNorm;

      if (!paused) {
        for (let i = TRAIL_HISTORY_LEN - 1; i > 0; i--) {
          trailX[i] = trailX[i - 1];
          trailY[i] = trailY[i - 1];
        }
        trailX[0] = bodyPos.x;
        trailY[0] = bodyPos.y;

        for (let s = 0; s < 2; s++) {
          const idx = sparkCursor;
          sparkCursor = (sparkCursor + 1) % SPARK_POOL_SIZE;
          const spreadAngle = Math.random() * Math.PI * 2;
          const speedMag = 0.02 + Math.random() * 0.065;
          sparkX[idx] = bodyPos.x + (Math.random() - 0.5) * 0.02;
          sparkY[idx] = bodyPos.y + (Math.random() - 0.5) * 0.02;
          sparkVX[idx] = -bodyPos.vx * 0.12 + Math.cos(spreadAngle) * speedMag;
          sparkVY[idx] = -bodyPos.vy * 0.12 + Math.sin(spreadAngle) * speedMag;
          sparkMaxLife[idx] = 4.0 + Math.random() * 3.0;
          sparkLife[idx] = sparkMaxLife[idx];
          sparkSize[idx] = 0.45 + Math.random() * 0.75;
          sparkColorType[idx] = ((idx + Math.floor(simTime)) % 4) as 0 | 1 | 2 | 3;
        }
      }

      // ========================================================================
      // RENDER PASS
      // ========================================================================
      const cx = viewWidth * 0.5;
      const cy = viewHeight * 0.53;
      const baseScale = Math.min(viewWidth, viewHeight) * 0.44;

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle =
        currentMode === 'celestial'
          ? celestialBgGrad || '#050412'
          : emeraldBgGrad || '#010203';
      ctx.fillRect(0, 0, viewWidth, viewHeight);

      ctx.globalCompositeOperation = 'lighter';

      // Soft field illumination during a Prismatic Multiplier Bloom
      if (bloomIntensity > 0.01) {
        ctx.fillStyle =
          currentMode === 'celestial'
            ? `rgba(147, 51, 234, ${bloomIntensity * 0.14})`
            : `rgba(16, 185, 129, ${bloomIntensity * 0.12})`;
        ctx.fillRect(0, 0, viewWidth, viewHeight);
      }

      // 1. Faint drifting silver dust & gravitational lensing motes
      for (let i = 0; i < DUST_COUNT; i++) {
        if (!paused) {
          dustY[i] -= dt * 0.028 * dustZ[i];
          dustX[i] += Math.sin(simTime * 0.35 + dustPhase[i]) * dt * 0.012;
          if (dustY[i] < -1.2) dustY[i] = 1.2;
          if (dustX[i] > 1.2) dustX[i] = -1.2;
          if (dustX[i] < -1.2) dustX[i] = 1.2;
        }

        let sx = cx + dustX[i] * (viewWidth * 0.52);
        let sy = cy + dustY[i] * (viewHeight * 0.52);

        if (currentMode === 'emerald') {
          const distFromCenter = Math.hypot(sx - cx, sy - cy) / baseScale;
          const lensingPush = Math.sin(distFromCenter * 18 - simTime * 2.0) * 4.5;
          const angle = Math.atan2(sy - cy, sx - cx);
          sx += Math.cos(angle + 1.57) * lensingPush;
          sy += Math.sin(angle + 1.57) * lensingPush;
        }

        const twinkle = 0.22 + 0.28 * Math.sin(simTime * 1.4 + dustPhase[i]);
        const size = (8 + dustZ[i] * 14) * (1 + bloomIntensity * 0.35);
        ctx.globalAlpha = twinkle * (currentMode === 'celestial' ? 0.55 : 0.35);
        ctx.drawImage(sprites.silverDust, sx - size * 0.5, sy - size * 0.5, size, size);
      }

      // 2. Emerald Mode: 3D Luminous Lattice Filaments
      if (currentMode === 'emerald') {
        const rotY = Math.sin(simTime * 0.24) * 0.28;
        const cosY = Math.cos(rotY);
        const sinY = Math.sin(rotY);

        for (let i = 0; i < filaments.length; i++) {
          const f = filaments[i];
          const age = simTime - f.birthTime;
          const pulse = 0.55 + 0.45 * Math.sin(simTime * 2.2 - i * 0.35);

          const proj = (x: number, y: number, z: number) => {
            const rx = x * cosY - z * sinY;
            const rz = x * sinY + z * cosY;
            const perspective = 1 / (1.65 - rz * 0.45);
            return {
              px: cx + rx * baseScale * 1.45 * perspective,
              py: cy + y * baseScale * 1.45 * perspective
            };
          };

          const p0 = proj(f.fromX, f.fromY, f.fromZ);
          const pc = proj(f.controlX, f.controlY, f.controlZ);
          const p1 = proj(f.toX, f.toY, f.toZ);

          const alpha = clamp(0.18 + pulse * 0.28 + bloomIntensity * 0.35, 0.1, 0.85);

          ctx.beginPath();
          ctx.moveTo(p0.px, p0.py);
          ctx.quadraticCurveTo(pc.px, pc.py, p1.px, p1.py);
          ctx.strokeStyle = `rgba(16, 185, 129, ${alpha * 0.42})`;
          ctx.lineWidth = 4.5 + bloomIntensity * 3;
          ctx.lineCap = 'round';
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(p0.px, p0.py);
          ctx.quadraticCurveTo(pc.px, pc.py, p1.px, p1.py);
          ctx.strokeStyle =
            age < 0.8
              ? `rgba(220, 255, 240, ${clamp(alpha * 1.4, 0, 1)})`
              : `rgba(110, 231, 183, ${alpha * 0.9})`;
          ctx.lineWidth = 1.35;
          ctx.stroke();

          ctx.globalAlpha = alpha * 0.85;
          ctx.drawImage(sprites.emeraldSpark, p1.px - 9, p1.py - 9, 18, 18);
        }
      }

      // 3. Concentric Rings of Liquid Light / Liquid Glass (Interactive to Touch/Click/Hover)
      const segments = 84;
      for (let rIdx = 0; rIdx < rings.length; rIdx++) {
        const ring = rings[rIdx];
        const radiusPx = ring.currentRadiusNorm * baseScale;
        const interactiveEnergy =
          ring.resonanceGlow + ring.hoverProximity * 0.55 + ring.touchPulsationBoost * 0.35;

        const triadColor = sampleCelestialTriadColor(
          ring.colorPhase + ring.touchColorShift + Math.sin(simTime * 0.22 + rIdx * 0.3) * 0.15,
          bloomIntensity + interactiveEnergy * 0.55
        );

        ctx.beginPath();
        for (let s = 0; s <= segments; s++) {
          const u = s / segments;
          const theta = u * Math.PI * 2 + ring.rotationAngle;

          const waveFreqBoost = ring.undulationFreq;
          const wave1 = Math.sin(
            theta * waveFreqBoost + simTime * (1.6 + ring.touchPulsationBoost * 2.2) + ring.phase
          );
          const wave2 = Math.cos(theta * (waveFreqBoost + 2) - simTime * 1.1);
          const radialOffset =
            (wave1 * 0.65 + wave2 * 0.35) *
            ring.undulationAmp *
            baseScale *
            (1 + interactiveEnergy * 1.15);

          const tiltScaleX = 1 - Math.abs(Math.sin(simTime * 0.35 + ring.tiltX)) * 0.08;
          const tiltScaleY = 1 - Math.abs(Math.cos(simTime * 0.29 + ring.tiltY)) * 0.06;

          const r = radiusPx + radialOffset;
          const px = cx + Math.cos(theta) * r * tiltScaleX;
          const py = cy + Math.sin(theta) * r * tiltScaleY;

          if (s === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();

        if (currentMode === 'celestial') {
          const baseAlpha = 0.14 + interactiveEnergy * 0.28 + bloomIntensity * 0.22;
          ctx.strokeStyle = `rgba(${triadColor.r}, ${triadColor.g}, ${triadColor.b}, ${clamp(
            baseAlpha * 0.55,
            0,
            0.75
          )})`;
          ctx.lineWidth = 14 + interactiveEnergy * 11 + bloomIntensity * 8;
          ctx.stroke();

          ctx.strokeStyle = `rgba(${triadColor.r}, ${triadColor.g}, ${triadColor.b}, ${clamp(
            baseAlpha * 1.35,
            0,
            0.92
          )})`;
          ctx.lineWidth = 4.2 + interactiveEnergy * 3.5;
          ctx.stroke();

          ctx.strokeStyle = `rgba(255, 250, 240, ${clamp(
            0.32 + interactiveEnergy * 0.55 + bloomIntensity * 0.4,
            0,
            0.98
          )})`;
          ctx.lineWidth = 1.25 + ring.hoverProximity * 0.8;
          ctx.stroke();
        } else {
          const glassAlpha = 0.14 + interactiveEnergy * 0.38 + bloomIntensity * 0.25;
          const shiftedColor =
            ring.touchColorShift > 0.05
              ? sampleCelestialTriadColor(ring.touchColorShift + rIdx * 0.12, 0.3)
              : EMERALD_PALETTE.prismaticCyan;

          ctx.save();
          ctx.translate(Math.cos(simTime + rIdx) * 2.2, Math.sin(simTime + rIdx) * 2.2);
          ctx.strokeStyle = `rgba(${shiftedColor.r}, ${shiftedColor.g}, ${shiftedColor.b}, ${clamp(
            glassAlpha * 0.6,
            0,
            0.7
          )})`;
          ctx.lineWidth = 6.5 + interactiveEnergy * 6.5;
          ctx.stroke();
          ctx.restore();

          ctx.strokeStyle = `rgba(16, 185, 129, ${clamp(glassAlpha * 0.95, 0, 0.88)})`;
          ctx.lineWidth = 2.8 + interactiveEnergy * 3.5;
          ctx.stroke();

          ctx.strokeStyle = `rgba(236, 253, 245, ${clamp(
            0.28 + interactiveEnergy * 0.6 + bloomIntensity * 0.35,
            0,
            0.95
          )})`;
          ctx.lineWidth = 1.0 + ring.hoverProximity * 0.8;
          ctx.stroke();
        }
      }

      // 3b. Render Interactive Touch Shockwave Ripples
      for (let i = touchRipples.length - 1; i >= 0; i--) {
        const tr = touchRipples[i];
        tr.radiusNorm += dt * 0.35;
        tr.alpha -= dt * 0.85;
        if (tr.alpha <= 0.01) {
          touchRipples.splice(i, 1);
          continue;
        }
        const rx = cx + tr.xNorm * baseScale;
        const ry = cy + tr.yNorm * baseScale;
        const rPx = tr.radiusNorm * baseScale;
        ctx.beginPath();
        ctx.arc(rx, ry, rPx, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${tr.r}, ${tr.g}, ${tr.b}, ${tr.alpha})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // 4. Crystalline Sparks & Coalescence into Sacred Mandalas / Spiral Galaxies
      for (let i = 0; i < SPARK_POOL_SIZE; i++) {
        if (!paused) {
          sparkLife[i] -= dt;
          if (sparkLife[i] <= 0) {
            const trailPick = i % TRAIL_HISTORY_LEN;
            sparkX[i] = trailX[trailPick] + (Math.random() - 0.5) * 0.04;
            sparkY[i] = trailY[trailPick] + (Math.random() - 0.5) * 0.04;
            sparkVX[i] = (Math.random() - 0.5) * 0.05;
            sparkVY[i] = (Math.random() - 0.5) * 0.05;
            sparkMaxLife[i] = 4.0 + Math.random() * 2.5;
            sparkLife[i] = sparkMaxLife[i];
          }

          if (coalescenceFactor > 0.01 && currentPattern !== 'scatter') {
            const target = computeCoalescenceTarget(i, SPARK_POOL_SIZE, currentPattern, simTime);
            const pull = coalescenceFactor * 3.2 * dt;
            sparkX[i] +=
              (target.x - sparkX[i]) * pull + sparkVX[i] * dt * (1 - coalescenceFactor * 0.7);
            sparkY[i] +=
              (target.y - sparkY[i]) * pull + sparkVY[i] * dt * (1 - coalescenceFactor * 0.7);
          } else {
            const angle = Math.atan2(sparkY[i], sparkX[i]);
            const vortexSpeed = 0.08;
            sparkX[i] += (sparkVX[i] - Math.sin(angle) * vortexSpeed) * dt;
            sparkY[i] += (sparkVY[i] + Math.cos(angle) * vortexSpeed) * dt;
          }
        }

        const lifeRatio = clamp(sparkLife[i] / sparkMaxLife[i], 0, 1);
        const envelope = Math.sin(lifeRatio * Math.PI);
        const px = cx + sparkX[i] * baseScale;
        const py = cy + sparkY[i] * baseScale;

        const sizePx =
          (10 + sparkSize[i] * 18) * (0.65 + envelope * 0.55) * (1 + bloomIntensity * 0.45);
        ctx.globalAlpha = clamp(
          envelope * (0.52 + coalescenceFactor * 0.35 + bloomIntensity * 0.3),
          0.05,
          0.95
        );

        let sprite: HTMLCanvasElement;
        if (currentMode === 'emerald') {
          sprite = i % 5 === 0 ? sprites.teal : sprites.emeraldSpark;
        } else {
          const cType = sparkColorType[i];
          sprite =
            cType === 0
              ? sprites.violet
              : cType === 1
                ? sprites.gold
                : cType === 2
                  ? sprites.teal
                  : sprites.whiteGold;
        }

        ctx.drawImage(sprite, px - sizePx * 0.5, py - sizePx * 0.5, sizePx, sizePx);
      }

      // 5. Graceful Comet / Emerald Photon Ribbon Wake
      for (let i = 0; i < TRAIL_HISTORY_LEN - 1; i++) {
        const u = 1 - i / TRAIL_HISTORY_LEN;
        const p0x = cx + trailX[i] * baseScale;
        const p0y = cy + trailY[i] * baseScale;
        const p1x = cx + trailX[i + 1] * baseScale;
        const p1y = cy + trailY[i + 1] * baseScale;

        ctx.beginPath();
        ctx.moveTo(p0x, p0y);
        ctx.lineTo(p1x, p1y);
        if (currentMode === 'celestial') {
          ctx.strokeStyle = `rgba(255, 236, 195, ${u * u * 0.55})`;
        } else {
          ctx.strokeStyle = `rgba(52, 211, 153, ${u * u * 0.68})`;
        }
        ctx.lineWidth = Math.max(0.8, u * 7.5);
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // 6. Luminous Comet-Core / Emerald Photon Nucleus
      const headX = cx + bodyPos.x * baseScale;
      const headY = cy + bodyPos.y * baseScale;
      const corePulse = 1 + Math.sin(simTime * 5.2) * 0.1 + bloomIntensity * 0.45;
      const outerHaloSize = 84 * corePulse;
      const innerCoreSize = 36 * corePulse;

      ctx.globalAlpha = 0.88;
      if (currentMode === 'celestial') {
        ctx.drawImage(
          sprites.gold,
          headX - outerHaloSize * 0.5,
          headY - outerHaloSize * 0.5,
          outerHaloSize,
          outerHaloSize
        );
        ctx.globalAlpha = 1.0;
        ctx.drawImage(
          sprites.whiteGold,
          headX - innerCoreSize * 0.5,
          headY - innerCoreSize * 0.5,
          innerCoreSize,
          innerCoreSize
        );
      } else {
        ctx.drawImage(
          sprites.emeraldCore,
          headX - outerHaloSize * 0.55,
          headY - outerHaloSize * 0.55,
          outerHaloSize * 1.1,
          outerHaloSize * 1.1
        );
        ctx.globalAlpha = 1.0;
        ctx.drawImage(
          sprites.whiteGold,
          headX - innerCoreSize * 0.45,
          headY - innerCoreSize * 0.45,
          innerCoreSize * 0.9,
          innerCoreSize * 0.9
        );
      }

      ctx.globalAlpha = 1.0;

      // Update Generative Ambient Soundscape & HUD telemetry on discrete changes
      if (now - lastHudUpdate > 280) {
        lastHudUpdate = now;
        const audioMod = computeAudioModulation(rings, bodyPos, coalescenceFactor, bloomIntensity);
        soundEngine.updateGenerativeSoundscape(audioMod, currentMode, paused);

        emitHud({
          countdown: currentCountdown,
          latticeScore,
          activeMultiplier,
          bloomReason,
          bloomIntensity: activeMultiplier ? 1 : 0,
          activePattern: currentPattern,
          filamentCount: filaments.length,
          ringCrossings,
          lastTouchedRing,
          ringTouchCount,
          ringFilterHz: audioMod.ringFilterCutoffHz,
          cometPitchHz: Math.round(audioMod.cometPitchHz)
        });
      }

      const frameDelay = isHeadless ? 45 : 16;
      timerId = setTimeout(() => {
        if (!isDisposed) {
          if (isHeadless) {
            renderLoop(performance.now());
          } else {
            rafId = requestAnimationFrame(renderLoop);
          }
        }
      }, frameDelay);
    };

    if (isHeadless) {
      renderLoop(performance.now());
    } else {
      rafId = requestAnimationFrame(renderLoop);
    }

    return () => {
      isDisposed = true;
      cancelAnimationFrame(rafId);
      if (timerId !== null) clearTimeout(timerId);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [bloomRequestRef, ringTouchRequestRef, clearLatticeRequestRef]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="hypnotic-canvas"
      aria-label="Vertical 9:16 hypnotic light simulation canvas. Click or touch near any concentric ring to shift its color, pulsation speed, and expansion."
      className="w-full h-full block cursor-pointer touch-none"
    />
  );
};
