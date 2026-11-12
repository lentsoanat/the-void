import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleCelestialTriadColor,
  computeCountdownValue,
  getMultiplierForStep,
  createInitialRings,
  stepRings,
  computeBodyPosition,
  computeCoalescenceTarget,
  detectRingCrossing,
  weaveLatticeFilament,
  computeAudioModulation,
  findNearestRingIndex,
  triggerRingInteraction
} from './engine';

test('sampleCelestialTriadColor smoothly interpolates between electric violet, molten gold, and icy teal', () => {
  const c0 = sampleCelestialTriadColor(0);
  const c1 = sampleCelestialTriadColor(1 / 3);
  const c2 = sampleCelestialTriadColor(2 / 3);

  assert.equal(c0.r, 157);
  assert.equal(c1.r, 245);
  assert.equal(c2.r, 45);

  const bloomed = sampleCelestialTriadColor(0, 1.0);
  assert.ok(bloomed.r > c0.r);
  assert.ok(bloomed.g > c0.g);
});

test('computeCountdownValue counts downward from 240 and loops cleanly', () => {
  assert.equal(computeCountdownValue(0, 240), 240);
  assert.equal(computeCountdownValue(10.2, 240), 230);
  assert.equal(computeCountdownValue(239.5, 240), 1);
  assert.equal(computeCountdownValue(240, 240), 240);
});

test('getMultiplierForStep cycles strictly through 7, 13, and 31', () => {
  assert.equal(getMultiplierForStep(0), 7);
  assert.equal(getMultiplierForStep(1), 13);
  assert.equal(getMultiplierForStep(2), 31);
  assert.equal(getMultiplierForStep(3), 7);
});

test('createInitialRings and stepRings respond to breathSpeedMultiplier and breathDepthMultiplier', () => {
  const ringsSlow = createInitialRings(8);
  const ringsFast = createInitialRings(8);

  const resSlow = stepRings(ringsSlow, 0.016, 1.8, 1.0, 0, 0.5);
  const resFast = stepRings(ringsFast, 0.016, 1.8, 1.5, 0, 2.2);

  assert.notEqual(ringsSlow[0].currentRadiusNorm, ringsFast[0].currentRadiusNorm);
  assert.ok(resSlow.meanExpansionNorm >= 0 && resSlow.meanExpansionNorm <= 1);
  assert.ok(resFast.meanExpansionNorm >= 0 && resFast.meanExpansionNorm <= 1);
});

test('findNearestRingIndex and triggerRingInteraction shift color, boost pulsation, and expand touched ring', () => {
  const rings = createInitialRings(8);
  const targetRadius = rings[3].currentRadiusNorm;

  const nearestIdx = findNearestRingIndex(rings, targetRadius + 0.01);
  assert.equal(nearestIdx, 3);

  const triggered = triggerRingInteraction(rings, nearestIdx, 'harmonic');
  assert.equal(triggered, true);
  assert.ok(rings[3].touchExpansionImpulse > 0.05);
  assert.ok(rings[3].touchPulsationBoost > 1.0);
  assert.ok(rings[3].touchColorShift > 0);
  // Neighboring rings also receive sympathetic ripple
  assert.ok(rings[2].touchExpansionImpulse > 0);
  assert.ok(rings[4].touchExpansionImpulse > 0);

  // Stepping rings applies expansion impulse to currentRadiusNorm
  const baseBeforeStep = rings[3].baseRadiusNorm;
  stepRings(rings, 0.016, 0.0, 0.0, 0, 1.0);
  assert.ok(rings[3].currentRadiusNorm > baseBeforeStep);
});

test('computeBodyPosition supports orbital, spiral, triquetra, and cursor guidance modes', () => {
  const orbitalPos = computeBodyPosition(3.5, 'emerald', null, null, 0, 'orbital');
  const spiralPos = computeBodyPosition(3.5, 'emerald', null, null, 0, 'spiral');
  const triquetraPos = computeBodyPosition(3.5, 'emerald', null, null, 0, 'triquetra');
  const cursorPos = computeBodyPosition(3.5, 'emerald', 0.45, -0.35, 1.0, 'cursor');

  assert.notDeepEqual(orbitalPos, spiralPos);
  assert.notDeepEqual(spiralPos, triquetraPos);
  assert.ok(Math.abs(cursorPos.x - 0.45) < 0.15);
  assert.ok(Math.abs(cursorPos.y - -0.35) < 0.15);
});

test('computeAudioModulation produces bounded resonant frequencies and shimmer densities', () => {
  const rings = createInitialRings(8);
  stepRings(rings, 0.016, 2.0, 1.2, 0.5, 1.4);
  const pos = computeBodyPosition(2.0, 'celestial');
  const mod = computeAudioModulation(rings, pos, 0.75, 0.4);

  assert.ok(mod.ringFilterCutoffHz >= 90 && mod.ringFilterCutoffHz <= 500);
  assert.ok(mod.cometPitchHz >= 110 && mod.cometPitchHz <= 400);
  assert.ok(mod.cometHumIntensity >= 0.1 && mod.cometHumIntensity <= 1.0);
  assert.ok(mod.shimmerDensity >= 0.1 && mod.shimmerDensity <= 1.0);
});

test('detectRingCrossing and weaveLatticeFilament build 3D emerald photon lattice on ring passage', () => {
  const rings = createInitialRings(6);
  const targetRing = rings[2];
  const rNorm = targetRing.currentRadiusNorm;

  const crossedIdx = detectRingCrossing(rings, rNorm - 0.03, rNorm + 0.03, 5.0);
  assert.equal(crossedIdx, 2);

  let filaments = weaveLatticeFilament([], rings[crossedIdx], { x: 0.3, y: 0.2, z: 0.1 }, 5.0);
  assert.equal(filaments.length, 1);
  assert.equal(filaments[0].ringIndex, 2);

  filaments = weaveLatticeFilament(filaments, rings[3], { x: -0.2, y: 0.4, z: -0.1 }, 6.0);
  assert.equal(filaments.length, 2);
  assert.equal(filaments[1].fromX, 0.3);
  assert.equal(filaments[1].fromY, 0.2);
});
