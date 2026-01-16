import { Missile } from './Missile.js';
import { Merge } from './Merge.js';
import { WEAPONS, calculateEffectiveRange } from '../data/weapons.js';
import { m2nm, wrapDeg, toAspect } from '../util/math.js';

// Distance in meters for merge detection (~5nm)
const MERGE_DISTANCE = 9260;

// Closure rate threshold for merge (m/s) - roughly 600 knots combined
const MERGE_CLOSURE_RATE = 300;

/**
 * Combat manager - orchestrates missile engagements and merge resolution
 */
export class Combat {
  constructor(simulation) {
    this.simulation = simulation;
    this.activeMissiles = [];
    this.activeMerges = [];
    this.resolvedMissiles = [];  // Keep for short time for UI display
  }

  /**
   * Update all combat elements
   * @param {number} delta - Time step in seconds
   */
  update(delta) {
    // Update all active missiles
    this.updateMissiles(delta);

    // Check for new merges
    this.checkForMerges();

    // Update active merges
    this.updateMerges(delta);
  }

  /**
   * Update all active merges
   * @param {number} delta - Time step in seconds
   */
  updateMerges(delta) {
    const toRemove = [];

    for (const merge of this.activeMerges) {
      merge.update(delta);

      if (merge.state === 'resolved') {
        toRemove.push(merge);
      }
    }

    // Remove resolved merges
    for (const merge of toRemove) {
      const index = this.activeMerges.indexOf(merge);
      if (index !== -1) {
        this.activeMerges.splice(index, 1);
      }
    }
  }

  /**
   * Launch a missile from shooter at target
   * @param {Aircraft} shooter - Aircraft firing the missile
   * @param {Aircraft} target - Target aircraft
   * @param {string} weaponType - Weapon type (e.g., 'AIM-120C')
   * @returns {Missile|null} The launched missile, or null if unable to fire
   */
  launchMissile(shooter, target, weaponType) {
    // Validate shooter and target
    if (!shooter || !target || !shooter.isAlive() || !target.isAlive()) {
      return null;
    }

    // Get weapon data
    const weaponData = WEAPONS[weaponType];
    if (!weaponData) {
      console.warn(`Unknown weapon type: ${weaponType}`);
      return null;
    }

    // Create missile
    const missile = new Missile({
      type: weaponType,
      category: weaponData.category,
      shooter: shooter,
      target: target
    });

    missile.init();

    // Add to active missiles
    this.activeMissiles.push(missile);

    // Add to shooter's missiles in flight
    shooter.missilesInFlight.push(missile);

    // Add to target's inbound threats
    target.inboundThreats.push(missile);

    // Emit missile launch event
    this.simulation.events.emit('missile:launch', {
      shooter,
      target,
      missile,
      brevity: missile.getBrevityCode(),
      weaponType
    });

    console.log(`${shooter.callsign}: ${missile.getBrevityCode()} on ${target.callsign}`);

    return missile;
  }

  /**
   * Update all active missiles
   * @param {number} delta - Time step in seconds
   */
  updateMissiles(delta) {
    const toRemove = [];

    for (const missile of this.activeMissiles) {
      const prevState = missile.state;

      // Update missile physics
      missile.update(delta);

      // Check for state transitions
      if (prevState === 'flight' && missile.state === 'active') {
        this.simulation.events.emit('missile:active', { missile });
      }

      if (prevState !== 'terminal' && missile.state === 'terminal') {
        this.simulation.events.emit('missile:terminal', { missile });
      }

      // Check if missile resolved
      if (missile.isDead()) {
        toRemove.push(missile);

        // Emit impact event
        this.simulation.events.emit('missile:impact', {
          missile,
          result: missile.state,  // 'hit' or 'miss'
          target: missile.target
        });

        // Handle hit
        if (missile.state === 'hit') {
          this.handleMissileHit(missile);
        }

        // Clean up references
        this.cleanupMissileReferences(missile);
      }
    }

    // Remove resolved missiles
    for (const missile of toRemove) {
      const index = this.activeMissiles.indexOf(missile);
      if (index !== -1) {
        this.activeMissiles.splice(index, 1);
        // Keep in resolved list briefly for UI
        this.resolvedMissiles.push({ missile, time: this.simulation.time });
      }
    }

    // Clean up old resolved missiles (older than 5 seconds)
    this.resolvedMissiles = this.resolvedMissiles.filter(
      r => this.simulation.time - r.time < 5
    );
  }

  /**
   * Handle a missile hit
   * @param {Missile} missile
   */
  handleMissileHit(missile) {
    const target = missile.target;
    if (!target) return;

    // For now, a hit is a kill (future: damage system)
    target.fuel = 0;  // Mark as dead

    // Emit kill event
    this.simulation.events.emit('pilot:splash', {
      shooter: missile.shooter,
      target: target
    });

    console.log(`SPLASH! ${missile.shooter?.callsign} killed ${target.callsign}`);
  }

  /**
   * Clean up missile references from aircraft
   * @param {Missile} missile
   */
  cleanupMissileReferences(missile) {
    // Remove from shooter's missiles in flight
    if (missile.shooter) {
      const shooterIndex = missile.shooter.missilesInFlight.indexOf(missile);
      if (shooterIndex !== -1) {
        missile.shooter.missilesInFlight.splice(shooterIndex, 1);
      }
    }

    // Remove from target's inbound threats
    if (missile.target) {
      const targetIndex = missile.target.inboundThreats.indexOf(missile);
      if (targetIndex !== -1) {
        missile.target.inboundThreats.splice(targetIndex, 1);
      }
    }
  }

  /**
   * Get all missiles targeting a specific aircraft
   * @param {Aircraft} aircraft
   * @returns {Missile[]}
   */
  getThreatsTo(aircraft) {
    return this.activeMissiles.filter(m => m.target === aircraft && !m.isDead());
  }

  /**
   * Get all active missiles targeting a specific aircraft
   * Optionally filter by shooter's flight
   * @param {Aircraft} target - The target aircraft
   * @param {Flight} [fromFlight] - Optional: only count missiles from this flight
   * @returns {Missile[]}
   */
  getMissilesTargeting(target, fromFlight = null) {
    return this.activeMissiles.filter(m => {
      if (m.target !== target || m.isDead()) return false;
      if (fromFlight && m.shooter?.flight !== fromFlight) return false;
      return true;
    });
  }

  /**
   * Count missiles from a flight targeting a specific aircraft
   * @param {Aircraft} target
   * @param {Flight} flight
   * @returns {number}
   */
  countMissilesFromFlightTo(target, flight) {
    return this.getMissilesTargeting(target, flight).length;
  }

  /**
   * Get closest threat to an aircraft
   * @param {Aircraft} aircraft
   * @returns {Missile|null}
   */
  getClosestThreat(aircraft) {
    const threats = this.getThreatsTo(aircraft);
    if (threats.length === 0) return null;

    let closest = null;
    let closestRange = Infinity;

    for (const missile of threats) {
      const range = missile.getRangeToTarget();
      if (range < closestRange) {
        closestRange = range;
        closest = missile;
      }
    }

    return closest;
  }

  /**
   * Check if a target is successfully notching a missile
   * @param {Missile} missile
   * @returns {boolean}
   */
  checkNotching(missile) {
    if (!missile || missile.category === 'fox2') {
      // IR missiles can't be notched
      return false;
    }

    return missile.isTargetNotching();
  }

  /**
   * Check if aircraft is within firing envelope for a weapon
   * Uses dynamic range calculation based on launch conditions
   * @param {Aircraft} shooter
   * @param {Aircraft} target
   * @param {string} category - 'fox1', 'fox2', or 'fox3'
   * @returns {boolean}
   */
  isInFiringEnvelope(shooter, target, category) {
    if (!shooter || !target) return false;

    // Get weapon type from shooter's inventory
    const weaponInfo = shooter.weaponInventory[category];
    if (!weaponInfo || !weaponInfo.type || weaponInfo.count <= 0) {
      return false;
    }

    const weaponData = WEAPONS[weaponInfo.type];
    if (!weaponData) return false;

    // Calculate range to target
    const dx = target.position.x - shooter.position.x;
    const dy = target.position.y - shooter.position.y;
    const rangeMeters = Math.sqrt(dx * dx + dy * dy);
    const rangeNm = m2nm(rangeMeters);

    // Calculate target aspect for dynamic range
    const bearingToTarget = Math.atan2(dx, dy) * 180 / Math.PI;
    const bearingFromTarget = wrapDeg(bearingToTarget + 180);
    const aspect = toAspect(bearingFromTarget - target.heading);

    // Calculate effective range based on launch conditions
    const effectiveRange = calculateEffectiveRange(
      weaponData,
      shooter.altitude,
      shooter.speed,
      aspect
    );

    // Check range envelope using effective range
    if (rangeNm < effectiveRange.min || rangeNm > effectiveRange.max) {
      return false;
    }

    // Check if target is within radar gimbal (for radar missiles)
    if (category === 'fox1' || category === 'fox3') {
      let angleOff = bearingToTarget - shooter.heading;
      while (angleOff > 180) angleOff -= 360;
      while (angleOff < -180) angleOff += 360;
      angleOff = Math.abs(angleOff);

      const gimbalLimit = shooter.performance?.radar?.gimbal || 60;
      if (angleOff > gimbalLimit) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get optimal weapon for engagement
   * @param {Aircraft} shooter
   * @param {Aircraft} target
   * @returns {string|null} Category of best weapon ('fox3', 'fox1', 'fox2') or null
   */
  getOptimalWeapon(shooter, target) {
    // Prefer fox3 (fire and forget), then fox1, then fox2
    const preferences = ['fox3', 'fox1', 'fox2'];

    for (const category of preferences) {
      if (this.isInFiringEnvelope(shooter, target, category)) {
        return category;
      }
    }

    return null;
  }

  /**
   * Check if an aircraft can launch a missile at a target
   * Enforces all launch discipline rules
   * @param {Aircraft} shooter
   * @param {Aircraft} target
   * @param {string} category - 'fox1', 'fox2', 'fox3'
   * @returns {{canLaunch: boolean, reason: string}}
   */
  canLaunch(shooter, target, category) {
    // Rule 1: Must have radar lock (STT)
    if (shooter.lockedTarget !== target) {
      return { canLaunch: false, reason: 'NO_LOCK' };
    }

    // Rule 2: Check weapon envelope
    if (!this.isInFiringEnvelope(shooter, target, category)) {
      return { canLaunch: false, reason: 'OUT_OF_ENVELOPE' };
    }

    // Rule 3: Max one active missile in flight per aircraft
    if (shooter.getActiveMissileCount() >= 1) {
      return { canLaunch: false, reason: 'MISSILE_IN_FLIGHT' };
    }

    // Rule 4: Target can't have 2+ missiles from same flight
    if (shooter.flight) {
      const missilesOnTarget = this.countMissilesFromFlightTo(target, shooter.flight);
      if (missilesOnTarget >= 2) {
        return { canLaunch: false, reason: 'TARGET_SATURATED' };
      }
    }

    // Rule 5: Weapon available
    if (!shooter.hasWeapon(category)) {
      return { canLaunch: false, reason: 'WINCHESTER' };
    }

    return { canLaunch: true, reason: 'OK' };
  }

  /**
   * Calculate closure rate between two aircraft
   * @param {Aircraft} ac1
   * @param {Aircraft} ac2
   * @returns {number} Closure rate in m/s (positive = closing)
   */
  getClosureRate(ac1, ac2) {
    // Get velocity vectors
    const v1 = ac1.getVelocityVector();
    const v2 = ac2.getVelocityVector();

    // Get position vector from ac1 to ac2
    const dx = ac2.position.x - ac1.position.x;
    const dy = ac2.position.y - ac1.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return 0;

    // Unit vector from ac1 to ac2
    const ux = dx / dist;
    const uy = dy / dist;

    // Relative velocity
    const relVx = v1.x - v2.x;
    const relVy = v1.y - v2.y;

    // Closure rate is relative velocity projected onto LOS
    return relVx * ux + relVy * uy;
  }

  /**
   * Check for merge conditions between aircraft pairs
   * Creates new merges when aircraft are within MERGE_DISTANCE with high closure
   */
  checkForMerges() {
    // Get all living aircraft
    const friendlies = [];
    const hostiles = [];

    for (const flight of this.simulation.flights) {
      for (const ac of flight.aircraft) {
        if (ac.isAlive() && !this.isInMerge(ac)) {
          friendlies.push(ac);
        }
      }
    }

    for (const flight of this.simulation.hostiles) {
      for (const ac of flight.aircraft) {
        if (ac.isAlive() && !this.isInMerge(ac)) {
          hostiles.push(ac);
        }
      }
    }

    // Check for merge conditions
    for (const friendly of friendlies) {
      for (const hostile of hostiles) {
        const dx = friendly.position.x - hostile.position.x;
        const dy = friendly.position.y - hostile.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if within merge distance
        if (distance < MERGE_DISTANCE) {
          // Check closure rate
          const closureRate = this.getClosureRate(friendly, hostile);

          // Only merge if closing or very close
          if (closureRate > MERGE_CLOSURE_RATE || distance < MERGE_DISTANCE / 2) {
            this.createMerge(friendly, hostile);
          }
        }
      }
    }
  }

  /**
   * Check if an aircraft is already in a merge
   */
  isInMerge(aircraft) {
    for (const merge of this.activeMerges) {
      if (merge.hasParticipant(aircraft)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Create a new merge between aircraft
   */
  createMerge(friendly, hostile) {
    // Check if either aircraft is already in a merge - if so, add to existing
    for (const merge of this.activeMerges) {
      if (merge.hasParticipant(friendly) || merge.hasParticipant(hostile)) {
        // Add both to existing merge
        merge.addParticipant(friendly);
        merge.addParticipant(hostile);
        return merge;
      }
    }

    // Create new merge
    const merge = new Merge({
      simulation: this.simulation,
      startTime: this.simulation.time
    });

    merge.addParticipant(friendly);
    merge.addParticipant(hostile);
    merge.lastRoundTime = this.simulation.time;

    this.activeMerges.push(merge);

    // Emit merge start event
    this.simulation.events.emit('merge:start', {
      merge,
      participants: merge.participants
    });

    // Emit MERGED comm event for friendly aircraft
    if (friendly.side === 'blue' && friendly.flight?.coordinator) {
      friendly.flight.coordinator.emitMerged(friendly);
    }

    // Auto-pause on merge
    if (this.simulation.autoPauseSettings.merge) {
      this.simulation.triggerAutoPause(
        `MERGE: ${friendly.callsign} and ${hostile.callsign}`
      );
    }

    console.log(`MERGE STARTED: ${friendly.callsign} vs ${hostile.callsign}`);

    return merge;
  }

  /**
   * Find merge involving a specific flight
   * @param {Flight} flight
   * @returns {Merge|null}
   */
  findMergeForFlight(flight) {
    for (const merge of this.activeMerges) {
      for (const ac of flight.aircraft) {
        if (merge.hasParticipant(ac)) {
          return merge;
        }
      }
    }
    return null;
  }

  /**
   * Find merge involving a specific aircraft
   * @param {Aircraft} aircraft
   * @returns {Merge|null}
   */
  findMergeForAircraft(aircraft) {
    for (const merge of this.activeMerges) {
      if (merge.hasParticipant(aircraft)) {
        return merge;
      }
    }
    return null;
  }

  /**
   * Request extend (disengage) from merge
   * @param {Flight} flight
   */
  requestExtend(flight) {
    const merge = this.findMergeForFlight(flight);
    if (!merge) return;

    // Determine which side is requesting
    const side = flight.aircraft[0]?.side === 'blue' ? 'blue' : 'red';
    merge.applyExtend(side);

    console.log(`${flight.callsign}: EXTEND (requesting disengage)`);
  }

  /**
   * Request press (aggressive) in merge
   * @param {Flight} flight
   */
  requestPress(flight) {
    const merge = this.findMergeForFlight(flight);
    if (!merge) return;

    // Determine which side is requesting
    const side = flight.aircraft[0]?.side === 'blue' ? 'blue' : 'red';
    merge.applyPress(side);

    console.log(`${flight.callsign}: PRESS (staying aggressive)`);
  }
}
