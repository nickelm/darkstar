import { PIDController } from '../util/pid.js';
import { getVelocity, kts2ms, wrapDeg } from '../util/math.js';
import { AIRCRAFT, getLoadoutForYear } from '../data/aircraft.js';

// BVR engagement timeline states
export const BVR_STATES = {
  PATROL: 'PATROL',       // Default - flying assigned pattern
  DETECTED: 'DETECTED',   // Radar contact - continue patrol, report CONTACT
  SORTING: 'SORTING',     // Multiple targets - flight assigns targets per doctrine
  COMMIT: 'COMMIT',       // Authorization received - turn toward, accelerate
  TARGET: 'TARGET',       // STT lock acquired - close to launch range
  LAUNCH: 'LAUNCH',       // Weapon away - report FOX call
  GUIDE: 'GUIDE',         // Missile in flight - fox1: maintain lock, fox3: until active
  CRANK: 'CRANK',         // Post-launch - turn to gimbal limit, reduce closure
  RECOMMIT: 'RECOMMIT',   // Splash or timeout - re-engage or RTB decision
  EGRESS: 'EGRESS'        // Winchester/bingo - disengaging
};

export class Aircraft {
  constructor(config) {
    this.id = config.id;
    this.callsign = config.callsign;
    this.type = config.type;         // 'F-15C', 'MiG-29', etc.
    this.side = config.side;         // 'blue', 'red'

    // State
    this.position = { x: 0, y: 0 };  // Local meters
    this.altitude = 0;                // Feet
    this.heading = 0;
    this.speed = 0;                   // Knots
    this.fuel = 100;                  // Percentage

    // Target values (set by commands)
    this.targetHeading = 0;
    this.targetAltitude = 0;
    this.targetSpeed = 0;

    // Weapons
    this.weapons = [];

    // Combat state
    this.weaponsAuthorization = 'hold';  // 'hold' | 'free'
    this.engagementPhase = 'none';       // 'none' | 'detected' | 'committed' | 'launching' | 'guiding' | 'cranking' | 'notching' | 'merged'
    this.missilesInFlight = [];          // Missiles we've launched
    this.inboundThreats = [];            // Missiles targeting us

    // BVR timeline state (separate from engagementPhase for tracking timeline position)
    this.engagementState = 'PATROL';     // BVR_STATES enum value

    // Initialize weapon inventory from aircraft data (filtered by scenario year if provided)
    this.weaponInventory = this.initWeaponInventory(config.type, config.year);

    // Control
    this.headingPID = null;
    this.altitudePID = null;
    this.speedPID = null;

    // AI state
    this.aiState = 'idle';
    this.currentCommand = null;
    this.target = null;
    this.lockedTarget = null;  // STT radar lock - only one at a time

    // Flight membership
    this.flight = null;
    this.isLead = false;
    this.formationIndex = 0;  // Position in formation (0 = lead)

    // AI controller (PilotAI or EnemyAI)
    this.ai = null;

    // Reference to GeoReference (set by Simulation)
    this.geoRef = null;

    // Aircraft performance data
    this.performance = AIRCRAFT[this.type] || AIRCRAFT['F-16C'] || {};
  }

  init() {
    // Initialize PID controllers with tuned parameters
    // Heading: Kp=2.0, Ki=0.1, Kd=0.5, maxOutput=6.0 deg/s, maxChange=2.0
    this.headingPID = new PIDController(2.0, 0.1, 0.5, 6.0, 2.0);

    // Set initial targets to current values
    this.targetHeading = this.heading;
    this.targetAltitude = this.altitude;
    this.targetSpeed = this.speed;
  }

  update(delta) {
    // 0. Let AI controller update targets (if present)
    if (this.ai) {
      this.ai.update(delta);
    }

    // 0.5 Wingman formation following (only if not lead and in idle/vectoring state)
    if (!this.isLead && this.flight && this.flight.lead && this.shouldFollowFormation()) {
      this.updateFormationFollow(delta);
    }

    // 1. Update heading via PID
    this.headingPID.setTarget(this.targetHeading);
    const turnRate = this.headingPID.update(delta, this.heading);
    this.heading = wrapDeg(this.heading + turnRate * delta);

    // 2. Update altitude (simplified - move toward target at fixed rate)
    const altDiff = this.targetAltitude - this.altitude;
    const maxClimb = 2000 * delta / 60; // 2000 ft/min
    if (Math.abs(altDiff) > maxClimb) {
      this.altitude += Math.sign(altDiff) * maxClimb;
    } else {
      this.altitude = this.targetAltitude;
    }

    // 3. Update speed (simplified - move toward target)
    const speedDiff = this.targetSpeed - this.speed;
    const maxAccel = 20 * delta; // 20 kts/s
    if (Math.abs(speedDiff) > maxAccel) {
      this.speed += Math.sign(speedDiff) * maxAccel;
    } else {
      this.speed = this.targetSpeed;
    }

    // 4. Calculate velocity and update position
    const speedMs = kts2ms(this.speed);
    const velocity = getVelocity(this.heading, 0, speedMs);

    this.position.x += velocity.x * delta;
    this.position.y += velocity.y * delta;

    // 5. Consume fuel (basic model)
    const cruiseSpeed = this.performance.speed?.cruise || 450;
    const fuelMultiplier = Math.pow(this.speed / cruiseSpeed, 2);
    const baseBurnRate = 100 / (2 * 60 * 60); // 100% over 2 hours
    this.fuel -= baseBurnRate * fuelMultiplier * delta;
    this.fuel = Math.max(0, this.fuel);
  }

  /**
   * Check if aircraft should follow formation (not engaged in combat)
   */
  shouldFollowFormation() {
    // Follow formation when idle, vectoring, or in patrol
    const formationStates = ['idle', 'vectoring', 'patrol'];
    return formationStates.includes(this.aiState);
  }

  /**
   * Update heading/speed to maintain formation position relative to lead
   */
  updateFormationFollow(delta) {
    const lead = this.flight.lead;
    const offset = this.flight.getFormationOffset(this.formationIndex);

    // Calculate desired world position based on lead's position and heading
    const leadHeadingRad = lead.heading * Math.PI / 180;

    // Rotate offset by lead's heading (offset.y is behind, offset.x is right)
    const desiredX = lead.position.x
      + offset.x * Math.cos(leadHeadingRad)
      - offset.y * Math.sin(leadHeadingRad);
    const desiredY = lead.position.y
      + offset.x * Math.sin(leadHeadingRad)
      + offset.y * Math.cos(leadHeadingRad);

    // Calculate delta to desired position
    const dx = desiredX - this.position.x;
    const dy = desiredY - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // If close enough to formation position, match lead's heading and speed
    if (distance < 100) {
      this.targetHeading = lead.targetHeading;
      this.targetSpeed = lead.targetSpeed;
      this.targetAltitude = lead.targetAltitude;
    } else {
      // Steer toward formation position
      const headingToPosition = Math.atan2(dx, dy) * 180 / Math.PI;
      this.targetHeading = wrapDeg(headingToPosition);

      // Adjust speed based on distance (speed up if falling behind)
      const speedAdjust = Math.min(distance / 500, 0.3); // Up to 30% faster
      this.targetSpeed = lead.speed * (1 + speedAdjust);
      this.targetAltitude = lead.targetAltitude;
    }
  }

  setHeading(heading) {
    this.targetHeading = wrapDeg(heading);
  }

  setAltitude(altitude) {
    this.targetAltitude = altitude;
  }

  setSpeed(speed) {
    const maxSpeed = this.performance.speed?.max || 1000;
    this.targetSpeed = Math.min(speed, maxSpeed);
  }

  getPosition() {
    if (!this.geoRef) return { lat: 0, lon: 0 };
    return this.geoRef.toGeo(this.position.x, this.position.y);
  }

  getVelocityVector() {
    const speedMs = kts2ms(this.speed);
    return getVelocity(this.heading, 0, speedMs);
  }

  launchWeapon(type, target) {
    // Future implementation
  }

  isAlive() {
    return this.fuel > 0;
  }

  isBingoFuel() {
    return this.fuel < 20;
  }

  isWinchester() {
    // Check if all weapon counts are zero
    if (!this.weaponInventory) return true;
    return Object.values(this.weaponInventory).every(w => w.count === 0);
  }

  /**
   * Count missiles we've launched that are still in flight
   * @returns {number}
   */
  getActiveMissileCount() {
    return this.missilesInFlight.filter(m => !m.isDead()).length;
  }

  /**
   * Get all active missiles we've launched
   * @returns {Missile[]}
   */
  getActiveMissiles() {
    return this.missilesInFlight.filter(m => !m.isDead());
  }

  /**
   * Initialize weapon inventory from aircraft type data
   * Optionally filtered by scenario year for era-appropriate loadouts
   * @param {string} type - Aircraft type (e.g., 'F-15C')
   * @param {number} [year] - Scenario year for era filtering (null = modern loadout)
   */
  initWeaponInventory(type, year = null) {
    const loadout = getLoadoutForYear(type, year);

    return {
      fox3: loadout.fox3 ? { type: loadout.fox3.type, count: loadout.fox3.count } : { type: null, count: 0 },
      fox1: loadout.fox1 ? { type: loadout.fox1.type, count: loadout.fox1.count } : { type: null, count: 0 },
      fox2: loadout.fox2 ? { type: loadout.fox2.type, count: loadout.fox2.count } : { type: null, count: 0 }
    };
  }

  /**
   * Check if aircraft has weapons of a specific category
   */
  hasWeapon(category) {
    return this.weaponInventory[category] && this.weaponInventory[category].count > 0;
  }

  /**
   * Consume a weapon from inventory
   * @returns {string|null} The weapon type consumed, or null if none available
   */
  consumeWeapon(category) {
    if (!this.hasWeapon(category)) return null;
    this.weaponInventory[category].count--;
    return this.weaponInventory[category].type;
  }

  /**
   * Get the best available weapon for BVR engagement
   * Prefers fox3, then fox1
   */
  getBestBVRWeapon() {
    if (this.hasWeapon('fox3')) return 'fox3';
    if (this.hasWeapon('fox1')) return 'fox1';
    return null;
  }
}