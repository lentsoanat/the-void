/**
 * Pure simulation logic, mathematics, harmonic color interpolation,
 * mandala/spiral coalescence targets, emerald photon lattice weaving,
 * interactive concentric ring reactions, and generative soundscape modulation metrics.
 * Decoupled from DOM/Canvas for deterministic unit testing and 60fps zero-GC execution.
 */

export type SimulationMode = 'celestial' | 'emerald';

export type CoalescencePattern = 'scatter' | 'mandala' | 'galaxy';

export type PhotonGuidanceMode = 'orbital' | 'spiral' | 'triquetra' | 'cursor';

export type RingReactionStyle = 'harmonic' | 'expand' | 'color' | 'pulse';

export type MultiplierValue = 7 | 13 | 31;

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface RingState {
  index: number;
  baseRadiusNorm: number; // Normalized to min(width, height) * 0.44
  currentRadiusNorm: number;
  phase: number;
  rotationAngle: number;
  rotationSpeed: number;
  breathSpeed: number;
  undulationFreq: number;
  undulationAmp: number;
  colorPhase: number;
  tiltX: number;
  tiltY: number;
  lastPassTime: number;
  resonanceGlow: number;         // 0..1 decays after comet/photon interaction or multiplier bloom
  touchExpansionImpulse: number; // Momentary radial expansion when user clicks/touches near ring
  touchPulsationBoost: number;   // Temporary pulsation speed & undulation boost on ring interaction
  touchColorShift: number;       // Cumulative color phase shift from user ring touches
  hoverProximity: number;        // 0..1 smooth proximity highlight when pointer is near this ring
}

export interface LatticeFilament {
  id: number;
  ringIndex: number;
  fromX: number; // Normalized -1..1
  fromY: number; // Normalized -1..1
  fromZ: number; // Normalized -1..1
  toX: number;
  toY: number;
  toZ: number;
  controlX: number;
  controlY: number;
  controlZ: number;
  birthTime: number;
  energy: number; // 0..1
  hueShift: number; // Subtle emerald-prismatic variation
}

export interface AudioModulationState {
  ringPulseMod: number;       // 0..1 aggregate expansion/contraction breath of the concentric rings
  ringFilterCutoffHz: number; // 90..480 Hz warm resonant filter frequency for ring drone
  cometPitchHz: number;       // 110..360 Hz ethereal hum pitch modulated by velocity & radial distance
  cometHumIntensity: number;  // 0..1 intensity of comet-core / photon hum
  shimmerDensity: number;     // 0..1 crystalline spark & silver dust shimmer activity
}

export const CELESTIAL_PALETTE: {
  violet: RGB;
  gold: RGB;
  teal: RGB;
  whiteGold: RGB;
} = {
  violet: { r: 157, g: 78, b: 221 },    // Electric violet
  gold: { r: 245, g: 158, b: 11 },      // Molten gold
  teal: { r: 45, g: 212, b: 191 },      // Icy teal
  whiteGold: { r: 255, g: 244, b: 214 } // Luminous white-gold comet core
};

export const EMERALD_PALETTE: {
  emeraldCore: RGB;
  emeraldGlow: RGB;
  prismaticCyan: RGB;
  prismaticGold: RGB;
} = {
  emeraldCore: { r: 16, g: 185, b: 129 },
  emeraldGlow: { r: 110, g: 231, b: 183 },
  prismaticCyan: { r: 56, g: 189, b: 248 },
  prismaticGold: { r: 250, g: 204, b: 21 }
};

export const MULTIPLIER_SEQUENCE: MultiplierValue[] = [7, 13, 31];

/**
 * Clamp a number between min and max.
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Smooth cosine interpolation between 0 and 1.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Interpolates smoothly across Electric Violet -> Molten Gold -> Icy Teal -> Electric Violet
 * given a continuous phase angle in [0, 1) or arbitrary float.
 */
export function sampleCelestialTriadColor(phase: number, bloomBoost = 0): RGB {
  const wrapped = ((phase % 1) + 1) % 1;
  const scaled = wrapped * 3;
  const segment = Math.floor(scaled);
  const frac = smoothstep(0, 1, scaled - segment);

  let c0: RGB;
  let c1: RGB;
  if (segment === 0) {
    c0 = CELESTIAL_PALETTE.violet;
    c1 = CELESTIAL_PALETTE.gold;
  } else if (segment === 1) {
    c0 = CELESTIAL_PALETTE.gold;
    c1 = CELESTIAL_PALETTE.teal;
  } else {
    c0 = CELESTIAL_PALETTE.teal;
    c1 = CELESTIAL_PALETTE.violet;
  }

  const r = c0.r + (c1.r - c0.r) * frac;
  const g = c0.g + (c1.g - c0.g) * frac;
  const b = c0.b + (c1.b - c0.b) * frac;

  const boost = clamp(bloomBoost, 0, 1) * 0.45;
  return {
    r: Math.round(clamp(r + (255 - r) * boost, 0, 255)),
    g: Math.round(clamp(g + (250 - g) * boost, 0, 255)),
    b: Math.round(clamp(b + (240 - b) * boost, 0, 255))
  };
}

/**
 * Computes the downward countdown from 240.0 based on elapsed seconds.
 * Smoothly loops back to 240 when reaching 0 so the meditative simulation is eternal.
 */
export function computeCountdownValue(elapsedSeconds: number, startFrom = 240): number {
  if (elapsedSeconds <= 0) return startFrom;
  const cycle = elapsedSeconds % startFrom;
  const remaining = startFrom - cycle;
  return Math.max(1, Math.ceil(remaining));
}

/**
 * Returns the next multiplier in sequence (×7, ×13, ×31).
 */
export function getMultiplierForStep(stepIndex: number): MultiplierValue {
  const idx = ((stepIndex % MULTIPLIER_SEQUENCE.length) + MULTIPLIER_SEQUENCE.length) % MULTIPLIER_SEQUENCE.length;
  return MULTIPLIER_SEQUENCE[idx];
}

/**
 * Creates the initial set of concentric liquid-light / liquid-glass rings.
 */
export function createInitialRings(count = 8): RingState[] {
  const rings: RingState[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 1) / count;
    const baseRadiusNorm = 0.14 + Math.pow(t, 1.08) * 0.78;
    const direction = i % 2 === 0 ? 1 : -1;
    rings.push({
      index: i,
      baseRadiusNorm,
      currentRadiusNorm: baseRadiusNorm,
      phase: i * 0.785398,
      rotationAngle: i * 0.4,
      rotationSpeed: direction * (0.12 + (count - i) * 0.025),
      breathSpeed: 0.45 + i * 0.06,
      undulationFreq: 3 + (i % 4),
      undulationAmp: 0.012 + (i % 3) * 0.004,
      colorPhase: i / count,
      tiltX: Math.sin(i * 1.1) * 0.18,
      tiltY: Math.cos(i * 0.9) * 0.18,
      lastPassTime: -10,
      resonanceGlow: 0,
      touchExpansionImpulse: 0,
      touchPulsationBoost: 0,
      touchColorShift: 0,
      hoverProximity: 0
    });
  }
  return rings;
}

/**
 * Finds the index of the concentric ring nearest to a normalized radial distance `radialDistNorm`.
 * Returns -1 if no ring is within `maxThresholdNorm`.
 */
export function findNearestRingIndex(
  rings: RingState[],
  radialDistNorm: number,
  maxThresholdNorm = 0.095
): number {
  let bestIdx = -1;
  let bestDist = maxThresholdNorm;

  for (let i = 0; i < rings.length; i++) {
    const d = Math.abs(rings[i].currentRadiusNorm - radialDistNorm);
    if (d <= bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Triggers an interactive reaction on the specified concentric ring (and subtle sympathetic ripples
 * on its immediate neighbors) when a user touches or clicks near a ring.
 * Depending on `reactionStyle`, it shifts the ring's color, accelerates its pulsation speed,
 * and/or momentarily expands its radius.
 */
export function triggerRingInteraction(
  rings: RingState[],
  targetIdx: number,
  reactionStyle: RingReactionStyle = 'harmonic'
): boolean {
  if (targetIdx < 0 || targetIdx >= rings.length) return false;

  const target = rings[targetIdx];
  target.resonanceGlow = 1.0;

  if (reactionStyle === 'harmonic' || reactionStyle === 'color') {
    target.touchColorShift = (target.touchColorShift + 0.34) % 1;
  }
  if (reactionStyle === 'harmonic' || reactionStyle === 'pulse') {
    target.touchPulsationBoost = clamp(target.touchPulsationBoost + 1.15, 0, 2.2);
  }
  if (reactionStyle === 'harmonic' || reactionStyle === 'expand') {
    target.touchExpansionImpulse = clamp(target.touchExpansionImpulse + 0.068, -0.05, 0.14);
  }

  // Sympathetic harmonic ripple on adjacent inner & outer rings
  const neighbors = [targetIdx - 1, targetIdx + 1];
  for (const nIdx of neighbors) {
    if (nIdx >= 0 && nIdx < rings.length) {
      const neighbor = rings[nIdx];
      neighbor.resonanceGlow = Math.max(neighbor.resonanceGlow, 0.58);
      if (reactionStyle === 'harmonic' || reactionStyle === 'expand') {
        neighbor.touchExpansionImpulse = clamp(neighbor.touchExpansionImpulse + 0.028, -0.04, 0.1);
      }
      if (reactionStyle === 'harmonic' || reactionStyle === 'pulse') {
        neighbor.touchPulsationBoost = clamp(neighbor.touchPulsationBoost + 0.45, 0, 1.8);
      }
      if (reactionStyle === 'harmonic' || reactionStyle === 'color') {
        neighbor.touchColorShift = (neighbor.touchColorShift + 0.14) % 1;
      }
    }
  }

  return true;
}

/**
 * Updates ring contraction/expansion breathing, undulation, rotation, interactive touch impulses,
 * and orbital alignment resonance.
 */
export function stepRings(
  rings: RingState[],
  dt: number,
  simTime: number,
  breathDepthMultiplier = 1.0,
  bloomIntensity = 0,
  breathSpeedMultiplier = 1.0,
  pointerRadialDistNorm: number | null = null
): { alignedPairCount: number; meanExpansionNorm: number } {
  const clampedDt = clamp(dt, 0, 0.05);
  let alignedCount = 0;
  let expansionSum = 0;

  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];

    // Advance phase & rotation faster when pulsation is boosted by user touch
    const pulseBoost = 1 + r.touchPulsationBoost * 1.65;
    r.phase += clampedDt * r.breathSpeed * (pulseBoost - 1) * 1.4;
    r.rotationAngle += r.rotationSpeed * clampedDt * (1 + bloomIntensity * 0.8 + r.touchPulsationBoost * 0.9);
    r.colorPhase = (r.colorPhase + clampedDt * (0.045 + r.touchPulsationBoost * 0.12)) % 1;

    const effectiveFreq = r.breathSpeed * clamp(breathSpeedMultiplier, 0.1, 4.0);
    const breathWave =
      Math.sin(simTime * effectiveFreq + r.phase) * 0.055 * breathDepthMultiplier * (1 + r.touchPulsationBoost * 0.35) +
      Math.cos(simTime * (effectiveFreq * 0.618) - r.index) * 0.024 * breathDepthMultiplier;

    // Update smooth hover proximity if user cursor is near this ring
    if (pointerRadialDistNorm !== null) {
      const distToRing = Math.abs(r.currentRadiusNorm - pointerRadialDistNorm);
      const targetHover = distToRing < 0.065 ? 1 - distToRing / 0.065 : 0;
      r.hoverProximity += (targetHover - r.hoverProximity) * Math.min(1, clampedDt * 12);
    } else {
      r.hoverProximity = Math.max(0, r.hoverProximity - clampedDt * 4);
    }

    // Apply momentary touch expansion impulse + subtle hover breathing lift
    r.currentRadiusNorm = clamp(
      r.baseRadiusNorm + breathWave + r.touchExpansionImpulse + r.hoverProximity * 0.012,
      0.07,
      0.99
    );

    // Smoothly decay interactive impulses
    r.resonanceGlow = Math.max(0, r.resonanceGlow - clampedDt * 0.58);
    r.touchExpansionImpulse *= Math.max(0, 1 - clampedDt * 2.6);
    if (Math.abs(r.touchExpansionImpulse) < 0.0005) r.touchExpansionImpulse = 0;
    r.touchPulsationBoost = Math.max(0, r.touchPulsationBoost - clampedDt * 0.42);

    expansionSum += (r.currentRadiusNorm - r.baseRadiusNorm);

    if (i > 0) {
      const prev = rings[i - 1];
      const angleDiff = Math.abs(Math.sin(r.rotationAngle - prev.rotationAngle));
      if (angleDiff < 0.04) {
        alignedCount++;
      }
    }
  }

  const meanExpansionNorm = rings.length > 0 ? clamp(0.5 + (expansionSum / rings.length) * 8, 0, 1) : 0.5;
  return { alignedPairCount: alignedCount, meanExpansionNorm };
}

/**
 * Computes the trajectory of the comet-core / emerald-green photon in normalized space (-1..1).
 * Supports distinct guidance patterns ('orbital', 'spiral', 'triquetra', 'cursor') and user pointer/keyboard steering
 * so user input directly shapes the woven 3D lattice.
 */
export function computeBodyPosition(
  simTime: number,
  mode: SimulationMode,
  pointerXNorm: number | null = null,
  pointerYNorm: number | null = null,
  pointerStrength = 0,
  guidanceMode: PhotonGuidanceMode = 'orbital',
  manualTargetX = 0,
  manualTargetY = 0
): { x: number; y: number; z: number; vx: number; vy: number } {
  let rawX = 0;
  let rawY = 0;
  let rawZ = 0;
  let vx = 0;
  let vy = 0;

  if (guidanceMode === 'spiral') {
    const radialSweep = 0.12 + (0.5 + 0.5 * Math.sin(simTime * 0.28)) * 0.72;
    const theta = simTime * 1.35;
    rawX = Math.cos(theta) * radialSweep;
    rawY = Math.sin(theta) * radialSweep;
    rawZ = Math.cos(simTime * 0.45) * 0.55;
    vx = -Math.sin(theta) * radialSweep * 1.35;
    vy = Math.cos(theta) * radialSweep * 1.35;
  } else if (guidanceMode === 'triquetra') {
    const t = simTime * 0.55;
    rawX = (Math.sin(t) + 2 * Math.sin(2 * t)) * 0.27;
    rawY = (Math.cos(t) - 2 * Math.cos(2 * t)) * 0.27;
    rawZ = -Math.sin(3 * t) * 0.55;
    vx = (Math.cos(t) + 4 * Math.cos(2 * t)) * 0.27 * 0.55;
    vy = (-Math.sin(t) + 4 * Math.sin(2 * t)) * 0.27 * 0.55;
  } else if (guidanceMode === 'cursor') {
    const targetX = pointerXNorm !== null ? pointerXNorm : manualTargetX;
    const targetY = pointerYNorm !== null ? pointerYNorm : manualTargetY;
    const microOrbitR = 0.08;
    rawX = clamp(targetX + Math.cos(simTime * 1.8) * microOrbitR, -0.92, 0.92);
    rawY = clamp(targetY + Math.sin(simTime * 1.8) * microOrbitR, -0.95, 0.95);
    rawZ = Math.sin(simTime * 0.65) * 0.5;
    vx = -Math.sin(simTime * 1.8) * microOrbitR * 1.8;
    vy = Math.cos(simTime * 1.8) * microOrbitR * 1.8;
    return { x: rawX, y: rawY, z: rawZ, vx, vy };
  } else {
    const freqX = mode === 'celestial' ? 0.42 : 0.51;
    const freqY = mode === 'celestial' ? 0.68 : 0.79;
    const freqZ = 0.33;
    const slowPrecession = simTime * 0.11;

    rawX =
      Math.sin(simTime * freqX) * Math.cos(slowPrecession) * 0.62 +
      Math.sin(simTime * 1.15) * 0.14;
    rawY =
      Math.cos(simTime * freqY) * 0.66 +
      Math.cos(simTime * 0.27 + 1.2) * 0.16;
    rawZ = Math.sin(simTime * freqZ + 0.5) * 0.5;

    vx = Math.cos(simTime * freqX) * freqX * 0.62;
    vy = -Math.sin(simTime * freqY) * freqY * 0.66;
  }

  if (pointerXNorm !== null && pointerYNorm !== null && pointerStrength > 0.001) {
    const s = clamp(pointerStrength, 0, 1);
    return {
      x: rawX * (1 - s * 0.72) + pointerXNorm * (s * 0.72),
      y: rawY * (1 - s * 0.72) + pointerYNorm * (s * 0.72),
      z: rawZ,
      vx,
      vy
    };
  }

  return { x: rawX, y: rawY, z: rawZ, vx, vy };
}

/**
 * Computes continuous generative ambient audio modulation parameters from live simulation state.
 */
export function computeAudioModulation(
  rings: RingState[],
  bodyPos: { x: number; y: number; z: number; vx: number; vy: number },
  coalescenceFactor: number,
  bloomIntensity: number
): AudioModulationState {
  let breathSum = 0;
  let glowSum = 0;
  for (let i = 0; i < rings.length; i++) {
    const delta = (rings[i].currentRadiusNorm - rings[i].baseRadiusNorm) / 0.08;
    breathSum += delta;
    glowSum += rings[i].resonanceGlow + rings[i].touchPulsationBoost * 0.35;
  }
  const ringCount = Math.max(1, rings.length);
  const ringPulseMod = clamp(0.5 + (breathSum / ringCount) * 0.5, 0, 1);
  const meanGlow = clamp(glowSum / ringCount, 0, 1);

  const speed = Math.hypot(bodyPos.vx, bodyPos.vy);
  const radialDist = clamp(Math.hypot(bodyPos.x, bodyPos.y), 0, 1);

  const ringFilterCutoffHz = Math.round(
    95 + ringPulseMod * 155 + meanGlow * 95 + bloomIntensity * 90
  );

  const cometPitchHz = Number(
    (130.81 + radialDist * 95 + clamp(speed, 0, 1.2) * 52 + bloomIntensity * 35).toFixed(2)
  );

  const cometHumIntensity = clamp(0.35 + speed * 0.35 + (1 - radialDist) * 0.25 + bloomIntensity * 0.2, 0.1, 1);
  const shimmerDensity = clamp(0.25 + coalescenceFactor * 0.5 + bloomIntensity * 0.35 + meanGlow * 0.25, 0.1, 1);

  return {
    ringPulseMod,
    ringFilterCutoffHz,
    cometPitchHz,
    cometHumIntensity,
    shimmerDensity
  };
}

/**
 * Computes the target normalized (x, y) coordinates for a particle index `idx` out of `total`
 * when coalescing into a temporary Sacred Geometric Mandala or Spiral Galaxy between the rings.
 */
export function computeCoalescenceTarget(
  idx: number,
  total: number,
  pattern: CoalescencePattern,
  simTime: number
): { x: number; y: number } {
  const safeTotal = Math.max(1, total);
  const u = idx / safeTotal;

  if (pattern === 'mandala') {
    const petals = 12;
    const layer = idx % 4;
    const baseLayerR = 0.18 + layer * 0.15;
    const theta = u * Math.PI * 2 * 4 + simTime * (layer % 2 === 0 ? 0.22 : -0.18);
    const petalMod = Math.cos(petals * theta) * 0.065 + Math.sin((petals / 2) * theta) * 0.03;
    const r = baseLayerR + petalMod;
    return {
      x: Math.cos(theta) * r,
      y: Math.sin(theta) * r
    };
  }

  if (pattern === 'galaxy') {
    const arms = 3;
    const armIndex = idx % arms;
    const armOffset = (armIndex * Math.PI * 2) / arms;
    const radialT = Math.pow(u, 0.72);
    const r = 0.08 + radialT * 0.68;
    const twist = radialT * 4.8;
    const angle = armOffset + twist - simTime * 0.35;
    return {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r
    };
  }

  const angle = u * Math.PI * 2 + simTime * 0.1;
  const r = 0.25 + (idx % 7) * 0.08;
  return {
    x: Math.cos(angle) * r,
    y: Math.sin(angle) * r
  };
}

/**
 * Detects whether the moving photon/comet crossed a ring boundary between `prevRadius` and `currRadius`.
 * If crossed, returns the index of the crossed ring (or -1 if none).
 */
export function detectRingCrossing(
  rings: RingState[],
  prevRadialDistNorm: number,
  currRadialDistNorm: number,
  simTime: number,
  minCooldownSec = 0.35
): number {
  const minR = Math.min(prevRadialDistNorm, currRadialDistNorm);
  const maxR = Math.max(prevRadialDistNorm, currRadialDistNorm);

  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    if (
      ring.currentRadiusNorm >= minR &&
      ring.currentRadiusNorm <= maxR &&
      simTime - ring.lastPassTime >= minCooldownSec
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Creates a new glowing 3D lattice filament when the emerald photon passes through a ring,
 * connecting its current passage node to a previous anchor node in 3D space.
 */
export function weaveLatticeFilament(
  existingFilaments: LatticeFilament[],
  ring: RingState,
  photonPos: { x: number; y: number; z: number },
  simTime: number,
  maxFilaments = 96
): LatticeFilament[] {
  const nextId = existingFilaments.length > 0
    ? existingFilaments[existingFilaments.length - 1].id + 1
    : 1;

  const prev = existingFilaments.length > 0
    ? existingFilaments[existingFilaments.length - 1]
    : null;

  const chordAngle = ring.rotationAngle + (nextId * 2.39996);
  const fromX = prev ? prev.toX : Math.cos(chordAngle) * ring.currentRadiusNorm * 0.7;
  const fromY = prev ? prev.toY : Math.sin(chordAngle) * ring.currentRadiusNorm * 0.7;
  const fromZ = prev ? prev.toZ : Math.sin(ring.phase) * 0.35;

  const midX = (fromX + photonPos.x) * 0.5;
  const midY = (fromY + photonPos.y) * 0.5;
  const archAngle = Math.atan2(midY, midX) + 0.45;
  const archRadius = ring.currentRadiusNorm * 0.85;

  const newFilament: LatticeFilament = {
    id: nextId,
    ringIndex: ring.index,
    fromX,
    fromY,
    fromZ,
    toX: photonPos.x,
    toY: photonPos.y,
    toZ: photonPos.z,
    controlX: Math.cos(archAngle) * archRadius * 0.55,
    controlY: Math.sin(archAngle) * archRadius * 0.55,
    controlZ: (fromZ + photonPos.z) * 0.5 + 0.2,
    birthTime: simTime,
    energy: 1.0,
    hueShift: (ring.index * 14) % 45
  };

  const updated = [...existingFilaments, newFilament];
  if (updated.length > maxFilaments) {
    return updated.slice(updated.length - maxFilaments);
  }
  return updated;
}
