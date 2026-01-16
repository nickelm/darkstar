import { PIDController } from '../util/pid.js';
import { WEAPONS } from '../data/weapons.js';
import { wrapDeg, m2nm, kts2ms, toAspect } from '../util/math.js';

let missileIdCounter = 0;

/**
 * Missile simulation class
 * Handles flight physics, guidance, state transitions, and Pk calculation
 */
export class Missile {
  constructor(config) {
    this.id = `missile_${++missileIdCounter}`;
    this.type = config.type;           // 'AIM-120C', 'R-27R', etc.
    this.category = config.category;   // 'fox1', 'fox2', 'fox3'

    this.shooter = config.shooter;
    this.target = config.target;

    this.position = { x: 0, y: 0 };
    this.altitude = 0;                 // Feet
    this.heading = 0;
    this.speed = 0;                    // Knots

    this.state = 'flight';             // 'flight', 'active', 'terminal', 'hit', 'miss'
    this.timeOfFlight = 0;
    this.maxDuration = 60;

    // Guidance
    this.guidancePID = null;
    this.needsIllumination = false;    // True for fox1
    this.activeRange = 10;             // nm - range at which fox3 goes active

    // Track previous LOS angle for proportional navigation
    this.lastLOSAngle = null;

    // Weapon data reference
    this.weaponData = WEAPONS[this.type] || {};
  }

  /**
   * Initialize missile from shooter position toward target
   */
  init() {
    // Set initial position from shooter
    this.position = { ...this.shooter.position };
    this.altitude = this.shooter.altitude;

    // Calculate initial heading toward target
    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    this.heading = wrapDeg(Math.atan2(dx, dy) * 180 / Math.PI);

    // Initialize from weapon data
    this.speed = this.weaponData.speed || 2500;
    this.maxDuration = this.weaponData.duration || 60;
    this.needsIllumination = this.weaponData.needsIllumination || false;
    this.activeRange = this.weaponData.pk?.active || 10;

    // Initialize guidance PID - missiles turn faster than aircraft
    // Higher gains for more responsive tracking
    this.guidancePID = new PIDController(4.0, 0.2, 1.0, 30.0, 15.0);

    // Store initial LOS angle for proportional navigation
    this.lastLOSAngle = this.heading;
  }

  /**
   * Update missile position and state
   * @param {number} delta - Time step in seconds
   */
  update(delta) {
    if (this.state === 'hit' || this.state === 'miss') return;

    this.timeOfFlight += delta;

    // Check timeout (fuel exhausted)
    if (this.timeOfFlight > this.maxDuration) {
      this.state = 'miss';
      return;
    }

    // Check if target is still alive
    if (!this.target || !this.target.isAlive()) {
      this.state = 'miss';
      return;
    }

    // For fox1, check if shooter is still illuminating (within gimbal limits)
    if (this.needsIllumination && !this.hasShooterLock()) {
      this.state = 'miss';
      return;
    }

    // Get target position
    const targetPos = this.target.position;
    const dx = targetPos.x - this.position.x;
    const dy = targetPos.y - this.position.y;
    const range = Math.sqrt(dx * dx + dy * dy);
    const rangeNm = m2nm(range);

    // Check intercept (50m lethal radius)
    if (range < 50) {
      this.resolve();
      return;
    }

    // State transitions for fox3
    if (this.category === 'fox3') {
      if (this.state === 'flight' && rangeNm < this.activeRange) {
        this.state = 'active';
      }
    }

    // Terminal phase at close range
    if (rangeNm < 2 && this.state !== 'terminal') {
      this.state = 'terminal';
    }

    // Proportional navigation guidance
    const losAngle = Math.atan2(dx, dy) * 180 / Math.PI;

    // Calculate LOS rate (degrees per second)
    let losRate = 0;
    if (this.lastLOSAngle !== null && delta > 0) {
      let angleDiff = losAngle - this.lastLOSAngle;
      // Handle angle wrapping
      while (angleDiff > 180) angleDiff -= 360;
      while (angleDiff < -180) angleDiff += 360;
      losRate = angleDiff / delta;
    }
    this.lastLOSAngle = losAngle;

    // Proportional navigation: commanded turn rate = N * LOS rate
    // N is the navigation constant (typically 3-5 for missiles)
    const N = 4;
    const commandedHeading = this.heading + N * losRate * delta;

    // Apply turn via PID controller
    this.guidancePID.setTarget(wrapDeg(commandedHeading));
    const turnRate = this.guidancePID.update(delta, this.heading);
    this.heading = wrapDeg(this.heading + turnRate * delta);

    // Update position
    const speedMs = kts2ms(this.speed);
    const headingRad = this.heading * Math.PI / 180;
    this.position.x += speedMs * Math.sin(headingRad) * delta;
    this.position.y += speedMs * Math.cos(headingRad) * delta;

    // Speed decay (drag) - missiles slow down over time
    // Decay rate depends on altitude (thinner air = less drag)
    const altitudeFactor = Math.max(0.5, 1 - this.altitude / 100000);
    this.speed *= (1 - 0.002 * altitudeFactor);

    // Minimum speed threshold - if too slow, missile can't maneuver effectively
    if (this.speed < 500) {
      this.state = 'miss';
    }
  }

  /**
   * Resolve missile - roll for hit or miss
   */
  resolve() {
    const pk = this.calculatePk();
    const roll = Math.random();

    if (roll < pk) {
      this.state = 'hit';
    } else {
      this.state = 'miss';
    }
  }

  /**
   * Calculate probability of kill based on engagement geometry
   * @returns {number} Pk between 0.1 and 0.95
   */
  calculatePk() {
    const weapon = this.weaponData;
    if (!weapon) return 0.5;

    let pk = weapon.pk?.base || 0.5;

    // Range modifier: optimal at mid-range, reduced at extremes
    const rangeNm = m2nm(this.getRangeToTarget());
    const minRange = weapon.range?.min || 2;
    const maxRange = weapon.range?.max || 45;
    const optimalRange = (minRange + maxRange) / 2;

    if (rangeNm < minRange) {
      // Too close - reduced Pk
      pk *= 0.5;
    } else if (rangeNm > maxRange) {
      // Too far - significantly reduced Pk
      pk *= 0.2;
    } else {
      // Within envelope - slight reduction at extremes
      const rangeRatio = Math.abs(rangeNm - optimalRange) / optimalRange;
      pk *= (1 - rangeRatio * 0.3);
    }

    // Aspect modifier
    const aspect = this.getTargetAspect();
    if (this.category === 'fox3' || this.category === 'fox1') {
      // Radar missiles work best head-on
      if (aspect > 120) pk *= 0.5;       // Tail chase - harder
      else if (aspect > 90) pk *= 0.7;   // Beam
    } else if (this.category === 'fox2') {
      // IR missiles need tail aspect
      if (aspect < 60) pk *= 0.4;        // Head-on - very hard
      else if (aspect < 90) pk *= 0.6;   // Flanking
      else if (aspect > 150) pk *= 1.2;  // Rear quarter - easier
    }

    // Target maneuvering modifier
    if (this.target.aiState === 'defensive') {
      pk *= 0.7;
    }

    // Altitude modifier (thinner air = less maneuverability for target)
    if (this.target.altitude > 40000) pk *= 1.1;
    if (this.target.altitude < 5000) pk *= 0.9;

    // Clamp Pk to reasonable bounds
    return Math.max(0.1, Math.min(0.95, pk));
  }

  /**
   * Check if missile has lock on target
   * For fox3: always has lock after going active
   * For fox1: depends on shooter maintaining illumination
   */
  hasLock() {
    if (this.state === 'hit' || this.state === 'miss') return false;

    if (this.category === 'fox3') {
      // Fire-and-forget after going active
      return this.state === 'active' || this.state === 'terminal';
    }

    if (this.category === 'fox1') {
      // Needs continuous illumination from shooter
      return this.hasShooterLock();
    }

    if (this.category === 'fox2') {
      // IR seeker - always tracking if not defeated
      return true;
    }

    return false;
  }

  /**
   * Check if shooter is still illuminating target (for fox1)
   */
  hasShooterLock() {
    if (!this.shooter || !this.shooter.isAlive()) return false;

    // Check if target is within shooter's radar gimbal limits
    const dx = this.target.position.x - this.shooter.position.x;
    const dy = this.target.position.y - this.shooter.position.y;
    const bearingToTarget = wrapDeg(Math.atan2(dx, dy) * 180 / Math.PI);

    // Calculate angle off shooter's nose
    let angleOff = bearingToTarget - this.shooter.heading;
    while (angleOff > 180) angleOff -= 360;
    while (angleOff < -180) angleOff += 360;
    angleOff = Math.abs(angleOff);

    // Check against radar gimbal limit (typically 60 degrees)
    const gimbalLimit = this.shooter.performance?.radar?.gimbal || 60;
    return angleOff <= gimbalLimit;
  }

  /**
   * Check if missile is in active guidance mode (fox3 only)
   */
  isActive() {
    return this.state === 'active' || this.state === 'terminal';
  }

  /**
   * Check if missile has resolved (hit or miss)
   */
  isDead() {
    return this.state === 'hit' || this.state === 'miss';
  }

  /**
   * Get current range to target in meters
   */
  getRangeToTarget() {
    if (!this.target) return Infinity;
    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Get target aspect angle (0 = hot/head-on, 180 = cold/tail)
   */
  getTargetAspect() {
    if (!this.target) return 0;

    // Calculate bearing from missile to target
    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    const bearingToTarget = Math.atan2(dx, dy) * 180 / Math.PI;

    // Bearing from target back to missile
    const bearingToMissile = wrapDeg(bearingToTarget + 180);

    // Aspect is angle between target's heading and bearing to missile
    return toAspect(bearingToMissile - this.target.heading);
  }

  /**
   * Check if target is successfully notching (beaming the missile)
   * Notching is flying perpendicular to defeat Doppler radar
   */
  isTargetNotching() {
    const aspect = this.getTargetAspect();
    // Notching is effective when target is 70-110 degrees aspect (beaming)
    return aspect >= 70 && aspect <= 110;
  }

  /**
   * Get brevity code for this missile type
   */
  getBrevityCode() {
    switch (this.category) {
      case 'fox1': return 'FOX ONE';
      case 'fox2': return 'FOX TWO';
      case 'fox3': return 'FOX THREE';
      default: return 'FOX';
    }
  }
}
