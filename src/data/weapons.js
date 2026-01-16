/**
 * Weapon definitions with performance data
 *
 * Fields:
 * - name: NATO/common name
 * - category: 'fox1' (SARH), 'fox2' (IR), 'fox3' (ARH)
 * - range: { min, max } in nautical miles (base values at optimal conditions)
 * - speed: missile speed in knots (motor phase)
 * - motor: motor burn duration in seconds
 * - coast: unpowered coast duration in seconds
 * - pk: { base, active? } probability of kill and active guidance range (nm)
 * - needsIllumination: true for fox1 (requires shooter radar lock)
 * - year: introduction year for era filtering
 */
export const WEAPONS = {
  'AIM-54C': {
    name: 'Phoenix',
    category: 'fox3',
    range: { min: 5, max: 100 },
    speed: 3000,
    motor: 12,
    coast: 80,
    pk: { base: 0.50, active: 15 },
    year: 1974
  },
  'AIM-120C': {
    name: 'AMRAAM',
    category: 'fox3',
    range: { min: 2, max: 50 },
    speed: 2500,
    motor: 9,
    coast: 55,
    pk: { base: 0.70, active: 12 },
    year: 1991
  },
  'AIM-7M': {
    name: 'Sparrow',
    category: 'fox1',
    range: { min: 3, max: 40 },
    speed: 2200,
    motor: 7,
    coast: 45,
    pk: { base: 0.55 },
    needsIllumination: true,
    year: 1982
  },
  'AIM-9M': {
    name: 'Sidewinder',
    category: 'fox2',
    range: { min: 0.5, max: 12 },
    speed: 1800,
    motor: 5,
    coast: 25,
    pk: { base: 0.65 },
    year: 1983
  },
  'R-77': {
    name: 'Adder',
    category: 'fox3',
    range: { min: 2, max: 45 },
    speed: 2400,
    motor: 8,
    coast: 50,
    pk: { base: 0.65, active: 10 },
    year: 1994
  },
  'R-27R': {
    name: 'Alamo-A',
    category: 'fox1',
    range: { min: 3, max: 40 },
    speed: 2200,
    motor: 7,
    coast: 45,
    pk: { base: 0.50 },
    needsIllumination: true,
    year: 1983
  },
  'R-27ER': {
    name: 'Alamo-C',
    category: 'fox1',
    range: { min: 3, max: 65 },
    speed: 2600,
    motor: 10,
    coast: 55,
    pk: { base: 0.55 },
    needsIllumination: true,
    year: 1990
  },
  'R-73': {
    name: 'Archer',
    category: 'fox2',
    range: { min: 0.3, max: 15 },
    speed: 1900,
    motor: 5,
    coast: 28,
    pk: { base: 0.70 },
    year: 1984
  }
};

/**
 * Calculate effective weapon range based on launch conditions
 *
 * Factors:
 * - Altitude: Higher = longer range (thinner air, less drag)
 *   - Sea level: 0.6x
 *   - 25,000 ft: 1.0x
 *   - 40,000 ft: 1.2x
 *
 * - Target aspect: Head-on = longer range
 *   - Hot (0-30 deg): 1.0x
 *   - Flank (30-70 deg): 0.8x
 *   - Beam (70-110 deg): 0.6x
 *   - Cold (110+ deg): 0.4x
 *
 * - Platform speed: Higher launch speed = longer range
 *   - +10% per 100kts above 300kts
 *
 * @param {Object} weapon - Weapon data from WEAPONS
 * @param {number} launchAlt - Launch altitude in feet
 * @param {number} launchSpeed - Launch platform speed in knots
 * @param {number} targetAspect - Target aspect angle (0=hot, 180=cold)
 * @returns {Object} { min: number, max: number } effective range in nm
 */
export function calculateEffectiveRange(weapon, launchAlt, launchSpeed, targetAspect) {
  const baseMax = weapon.range.max;

  // Altitude factor: sea level=0.6x, 25k ft=1.0x, 40k ft=1.2x
  let altFactor;
  if (launchAlt <= 0) {
    altFactor = 0.6;
  } else if (launchAlt <= 25000) {
    altFactor = 0.6 + (launchAlt / 25000) * 0.4;
  } else if (launchAlt <= 40000) {
    altFactor = 1.0 + ((launchAlt - 25000) / 15000) * 0.2;
  } else {
    altFactor = 1.2;
  }

  // Aspect factor: hot=1.0, flank=0.8, beam=0.6, cold=0.4
  let aspectFactor;
  if (targetAspect <= 30) {
    aspectFactor = 1.0;   // Hot
  } else if (targetAspect <= 70) {
    aspectFactor = 0.8;   // Flank
  } else if (targetAspect <= 110) {
    aspectFactor = 0.6;   // Beam
  } else {
    aspectFactor = 0.4;   // Cold (tail chase)
  }

  // Platform speed bonus: ~10% per 100kts above 300
  const speedBonus = 1.0 + Math.max(0, (launchSpeed - 300) / 100) * 0.1;

  return {
    min: weapon.range.min,
    max: baseMax * altFactor * aspectFactor * speedBonus
  };
}
