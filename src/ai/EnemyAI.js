import { wrapDeg, m2nm } from '../util/math.js';
import { BVR_STATES } from '../simulation/Aircraft.js';

/**
 * AI controller for hostile aircraft
 * Handles state machine for INGRESS, ENGAGE, EGRESS, DEFENSIVE states
 * Also tracks BVR timeline states autonomously (no player prompts)
 */
export class EnemyAI {
  constructor(aircraft, simulation) {
    this.aircraft = aircraft;
    this.simulation = simulation;
    this.state = 'INGRESS';

    // Behavioral parameters
    this.aggression = 0.5;        // 0 = defensive, 1 = aggressive
    this.targetFixation = 0.5;    // How long to ignore threats

    // Target/objective
    this.objective = null;        // Strike target or patrol point (defaults to bullseye)
    this.engageTarget = null;     // Aircraft we're fighting

    // Weapon employment tracking
    this.lastMissileLaunchTime = 0;
    this.activeMissile = null;

    // Defensive tracking
    this.defensiveStartTime = 0;
    this.notchHeading = null;

    // BVR state tracking
    this.lastBVRState = BVR_STATES.PATROL;
  }

  update(delta) {
    // Check for threats before normal state handling
    if (this.shouldGoDefensive()) {
      if (this.state !== 'DEFENSIVE') {
        this.state = 'DEFENSIVE';
        this.defensiveStartTime = this.simulation.time;
        this.notchHeading = null;
        this.releaseLock();  // Release lock when going defensive
      }
    }

    switch (this.state) {
      case 'INGRESS':
        this.handleIngress(delta);
        break;
      case 'ENGAGE':
        this.handleEngage(delta);
        break;
      case 'EGRESS':
        this.handleEgress(delta);
        break;
      case 'DEFENSIVE':
        this.handleDefensive(delta);
        break;
    }

    // Sync AI state to aircraft state string
    this.aircraft.aiState = this.state.toLowerCase();

    // Update BVR state autonomously (no prompts for enemies)
    this.updateBVRState();
  }

  /**
   * Update BVR engagement state autonomously
   * Enemies make decisions without player interaction
   */
  updateBVRState() {
    const currentState = this.aircraft.engagementState;

    // Track state changes for events
    if (currentState !== this.lastBVRState) {
      this.simulation.events.emit('bvr:stateChange', {
        aircraft: this.aircraft,
        oldState: this.lastBVRState,
        newState: currentState
      });
      this.lastBVRState = currentState;
    }
  }

  /**
   * Transition BVR state
   * @param {string} newState - BVR_STATES value
   */
  transitionBVRState(newState) {
    if (this.aircraft.engagementState !== newState) {
      this.aircraft.engagementState = newState;
    }
  }

  // State handlers

  handleIngress(delta) {
    // BVR state: PATROL while ingressing
    if (this.aircraft.engagementState === BVR_STATES.PATROL) {
      // Check for threats - autonomous DETECTED transition
      const threat = this.detectThreat();
      if (threat) {
        this.transitionBVRState(BVR_STATES.DETECTED);
      }
    }

    // Fly toward objective (bullseye by default)
    const objective = this.getObjective();
    const targetPos = this.simulation.toLocal(objective.lat, objective.lon);

    const dx = targetPos.x - this.aircraft.position.x;
    const dy = targetPos.y - this.aircraft.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Calculate heading to objective
    let heading = Math.atan2(dx, dy) * 180 / Math.PI;
    this.aircraft.setHeading(wrapDeg(heading));

    // Check if reached objective (within 5nm)
    if (distance < 9260) {
      // Reached objective, could orbit or egress
      // For now, continue flying through
    }

    // Check for nearby threats and potentially engage
    const threat = this.detectThreat();
    if (threat && this.shouldEngage(threat)) {
      this.engageTarget = threat;
      this.state = 'ENGAGE';
      // Autonomous COMMIT - enemies are always weapons free
      this.transitionBVRState(BVR_STATES.COMMIT);
    }
  }

  handleEngage(delta) {
    if (!this.engageTarget || !this.engageTarget.isAlive()) {
      this.engageTarget = null;
      this.releaseLock();
      this.state = 'INGRESS';
      this.transitionBVRState(BVR_STATES.PATROL);
      return;
    }

    // Turn to engage the threat
    const dx = this.engageTarget.position.x - this.aircraft.position.x;
    const dy = this.engageTarget.position.y - this.aircraft.position.y;
    let heading = Math.atan2(dx, dy) * 180 / Math.PI;
    this.aircraft.setHeading(wrapDeg(heading));

    // Check range and fire if appropriate
    const distance = Math.sqrt(dx * dx + dy * dy);
    const rangeNm = m2nm(distance);

    // Try to acquire/maintain lock when in range
    if (rangeNm < 50) {  // Within acquisition range
      if (this.aircraft.lockedTarget !== this.engageTarget) {
        const acquired = this.acquireLock(this.engageTarget);
        // Transition to TARGET when lock acquired
        if (acquired && this.aircraft.engagementState === BVR_STATES.COMMIT) {
          this.transitionBVRState(BVR_STATES.TARGET);
        }
      }
    }

    // Check if lock is maintained (target still in gimbal)
    if (this.aircraft.lockedTarget && !this.isInGimbalLimits(this.aircraft.lockedTarget)) {
      this.releaseLock();
      // Revert to COMMIT if we lose lock
      if (this.aircraft.engagementState === BVR_STATES.TARGET) {
        this.transitionBVRState(BVR_STATES.COMMIT);
      }
    }

    // Enemy AI is always weapons free - fire when in envelope
    if (this.canFireMissile() && this.isInFiringEnvelope(rangeNm)) {
      this.fireMissile();
    }

    // Handle active missile guidance
    if (this.activeMissile && !this.activeMissile.isDead()) {
      // GUIDE state while missile in flight
      if (this.aircraft.engagementState === BVR_STATES.TARGET ||
          this.aircraft.engagementState === BVR_STATES.LAUNCH) {
        this.transitionBVRState(BVR_STATES.GUIDE);
      }

      // Check for fox3 going active -> CRANK
      if (this.activeMissile.category === 'fox3' && this.activeMissile.isActive()) {
        if (this.aircraft.engagementState === BVR_STATES.GUIDE) {
          this.transitionBVRState(BVR_STATES.CRANK);
        }
      }
    } else if (this.activeMissile?.isDead()) {
      // Missile resolved - RECOMMIT
      this.transitionBVRState(BVR_STATES.RECOMMIT);
      this.activeMissile = null;

      // Then back to COMMIT if target alive
      if (this.engageTarget?.isAlive()) {
        this.transitionBVRState(BVR_STATES.COMMIT);
      }
    }
  }

  handleEgress(delta) {
    // Fly away from bullseye (opposite direction)
    const bullseye = this.simulation.bullseye;
    const targetPos = this.simulation.toLocal(bullseye.lat, bullseye.lon);

    const dx = this.aircraft.position.x - targetPos.x;
    const dy = this.aircraft.position.y - targetPos.y;

    let heading = Math.atan2(dx, dy) * 180 / Math.PI;
    this.aircraft.setHeading(wrapDeg(heading));
  }

  handleDefensive(delta) {
    const threats = this.simulation.combat.getThreatsTo(this.aircraft);

    if (threats.length === 0) {
      // No more threats - resume previous behavior
      const defensiveTime = this.simulation.time - this.defensiveStartTime;
      if (defensiveTime > 3) {
        if (this.engageTarget && this.engageTarget.isAlive()) {
          this.state = 'ENGAGE';
        } else {
          this.state = 'INGRESS';
        }
        this.notchHeading = null;
        return;
      }
    }

    // Get closest threat and notch it
    const closestThreat = this.simulation.combat.getClosestThreat(this.aircraft);

    if (closestThreat) {
      // Calculate notch heading (perpendicular to threat)
      if (this.notchHeading === null) {
        this.notchHeading = this.calculateNotchHeading(closestThreat);
      }

      this.aircraft.setHeading(this.notchHeading);
    }
  }

  // Combat methods

  /**
   * Check if we can fire a missile (cooldown elapsed and have weapons)
   */
  canFireMissile() {
    const timeSinceLast = this.simulation.time - this.lastMissileLaunchTime;
    if (timeSinceLast < 10) return false;  // 10 second cooldown

    // Check if we have weapons
    return this.aircraft.getBestBVRWeapon() !== null;
  }

  /**
   * Check if target is in firing envelope
   */
  isInFiringEnvelope(rangeNm) {
    // More aggressive enemies fire from farther out
    const maxRange = 30 + (this.aggression * 15);  // 30-45nm
    const minRange = 2;

    return rangeNm >= minRange && rangeNm <= maxRange;
  }

  /**
   * Fire a missile at the current target
   */
  fireMissile() {
    const weaponCategory = this.aircraft.getBestBVRWeapon();
    if (!weaponCategory) return;

    // Must have lock first
    if (this.aircraft.lockedTarget !== this.engageTarget) {
      this.acquireLock(this.engageTarget);
    }
    if (!this.aircraft.lockedTarget) return;

    // Use full launch discipline check (includes missile-in-flight, saturation, etc.)
    const launchCheck = this.simulation.combat.canLaunch(
      this.aircraft,
      this.engageTarget,
      weaponCategory
    );

    if (!launchCheck.canLaunch) {
      // Debug: log why enemy can't launch
      // console.log(`${this.aircraft.callsign}: canLaunch=${launchCheck.canLaunch}, reason=${launchCheck.reason}`);
      return;  // Can't fire - discipline check failed
    }

    const weaponInfo = this.aircraft.weaponInventory[weaponCategory];
    if (!weaponInfo || weaponInfo.count <= 0) return;

    const weaponType = weaponInfo.type;

    // Consume weapon from inventory
    this.aircraft.consumeWeapon(weaponCategory);

    // Launch missile via combat manager
    const missile = this.simulation.combat.launchMissile(
      this.aircraft,
      this.engageTarget,
      weaponType
    );

    if (missile) {
      this.activeMissile = missile;
      this.lastMissileLaunchTime = this.simulation.time;

      // BVR state: LAUNCH then GUIDE
      this.transitionBVRState(BVR_STATES.LAUNCH);
      this.transitionBVRState(BVR_STATES.GUIDE);

      // Auto-pause on missile launch (enemy fires too!)
      if (this.simulation.autoPauseSettings.missileLaunch) {
        this.simulation.triggerAutoPause(`${this.aircraft.callsign} ${missile.getBrevityCode()}`);
      }
    }
  }

  // Decision methods

  detectThreat() {
    // Find closest friendly aircraft
    let closestThreat = null;
    let closestDist = Infinity;

    for (const flight of this.simulation.flights) {
      for (const ac of flight.aircraft) {
        if (!ac.isAlive()) continue;

        const dx = ac.position.x - this.aircraft.position.x;
        const dy = ac.position.y - this.aircraft.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Threat within 30nm
        if (dist < 55560 && dist < closestDist) {
          closestDist = dist;
          closestThreat = ac;
        }
      }
    }

    return closestThreat;
  }

  shouldEngage(threat) {
    // Engage if aggressive enough and threat is close
    const dx = threat.position.x - this.aircraft.position.x;
    const dy = threat.position.y - this.aircraft.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // More aggressive = engage from farther away
    const engageRange = 18500 + (this.aggression * 37000); // 10-30nm
    return dist < engageRange;
  }

  shouldGoDefensive() {
    // Check for inbound missiles
    const threats = this.simulation.combat.getThreatsTo(this.aircraft);
    if (threats.length === 0) return false;

    // Go defensive if threat is within 15nm (enemies are less cautious)
    for (const missile of threats) {
      const range = m2nm(missile.getRangeToTarget());
      if (range < 15) return true;
    }

    return false;
  }

  /**
   * Calculate heading to notch (fly perpendicular to) an incoming missile
   */
  calculateNotchHeading(missile) {
    // Get bearing from missile to us
    const dx = this.aircraft.position.x - missile.position.x;
    const dy = this.aircraft.position.y - missile.position.y;
    const bearingFromMissile = Math.atan2(dx, dy) * 180 / Math.PI;

    // Notch by flying perpendicular (±90 degrees)
    const perpRight = wrapDeg(bearingFromMissile + 90);
    const perpLeft = wrapDeg(bearingFromMissile - 90);

    // Pick the heading closer to our current heading (quicker turn)
    const diffRight = Math.abs(this.normalizeAngle(perpRight - this.aircraft.heading));
    const diffLeft = Math.abs(this.normalizeAngle(perpLeft - this.aircraft.heading));

    return diffRight < diffLeft ? perpRight : perpLeft;
  }

  /**
   * Normalize angle to -180 to 180 range
   */
  normalizeAngle(angle) {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  }

  // Lock management methods

  /**
   * Attempt to acquire radar lock on target
   * @param {Aircraft} target
   * @returns {boolean} True if lock acquired
   */
  acquireLock(target) {
    if (!this.isInGimbalLimits(target)) {
      return false;
    }

    // Release any existing lock first
    this.releaseLock();

    // Acquire new lock
    this.aircraft.lockedTarget = target;
    return true;
  }

  /**
   * Release current radar lock
   */
  releaseLock() {
    this.aircraft.lockedTarget = null;
  }

  /**
   * Check if target is within radar gimbal limits
   * @param {Aircraft} target
   * @returns {boolean}
   */
  isInGimbalLimits(target) {
    if (!target) return false;

    const dx = target.position.x - this.aircraft.position.x;
    const dy = target.position.y - this.aircraft.position.y;
    const bearing = Math.atan2(dx, dy) * 180 / Math.PI;

    let angleOff = bearing - this.aircraft.heading;
    while (angleOff > 180) angleOff -= 360;
    while (angleOff < -180) angleOff += 360;

    const gimbal = this.aircraft.performance?.radar?.gimbal || 60;
    return Math.abs(angleOff) <= gimbal;
  }

  selectTarget() {
    return this.detectThreat();
  }

  getObjective() {
    // Return assigned objective or default to bullseye
    return this.objective || this.simulation.bullseye;
  }

  setObjective(objective) {
    this.objective = objective;
  }
}
