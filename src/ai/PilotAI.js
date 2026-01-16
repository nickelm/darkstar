import { wrapDeg, m2nm } from '../util/math.js';
import { BVR_STATES } from '../simulation/Aircraft.js';

/**
 * AI controller for friendly pilot aircraft
 * Handles state machine for IDLE, VECTORING, INTERCEPT, ENGAGE, GUIDING, CRANKING, DEFENSIVE states
 */
export class PilotAI {
  constructor(aircraft, simulation) {
    this.aircraft = aircraft;
    this.simulation = simulation;
    this.state = 'IDLE';
    this.target = null;

    // Weapon employment tracking
    this.lastMissileLaunchTime = 0;
    this.missileGuidedTime = 0;
    this.activeMissile = null;  // Current missile being guided

    // Defensive tracking
    this.defensiveStartTime = 0;
    this.notchHeading = null;

    // Request tracking (to avoid spamming)
    this.lastWeaponsRequest = 0;
    this.weaponsRequestCooldown = 30;  // seconds

    // Autonomous mode (BANZAI) - skip auth requests, auto-commit
    this.autonomousMode = false;
    this.directedCrankDirection = null;  // 'left' or 'right' if GCI directed

    // Cranking parameters
    this.crankDirection = 1;  // 1 = right, -1 = left
    this.gimbalLimit = 60;    // degrees

    // BVR state tracking
    this.lastBVRState = BVR_STATES.PATROL;
  }

  update(delta) {
    // Check for threats before normal state handling
    if (this.shouldGoDefensive()) {
      if (this.state !== 'DEFENSIVE') {
        this.state = 'DEFENSIVE';
        this.defensiveStartTime = this.simulation.time;
        this.releaseLock();  // Release lock when going defensive
        this.simulation.events.emit('pilot:defending', {
          aircraft: this.aircraft,
          threat: this.simulation.combat.getClosestThreat(this.aircraft)
        });
      }
    }

    switch (this.state) {
      case 'IDLE':
        this.handleIdle(delta);
        break;
      case 'VECTORING':
        this.handleVectoring(delta);
        break;
      case 'INTERCEPT':
        this.handleIntercept(delta);
        break;
      case 'ENGAGE':
        this.handleEngage(delta);
        break;
      case 'GUIDING':
        this.handleGuiding(delta);
        break;
      case 'CRANKING':
        this.handleCranking(delta);
        break;
      case 'DEFENSIVE':
        this.handleDefensive(delta);
        break;
      case 'RTB':
        this.handleRTB(delta);
        break;
    }

    // Sync AI state to aircraft state string
    this.aircraft.aiState = this.state.toLowerCase();

    // Track BVR state changes
    if (this.aircraft.engagementState !== this.lastBVRState) {
      this.simulation.events.emit('bvr:stateChange', {
        aircraft: this.aircraft,
        oldState: this.lastBVRState,
        newState: this.aircraft.engagementState
      });
      this.lastBVRState = this.aircraft.engagementState;
    }
  }

  /**
   * Transition BVR engagement state
   * @param {string} newState - BVR_STATES value
   */
  transitionBVRState(newState) {
    const oldState = this.aircraft.engagementState;
    if (oldState === newState) return;

    this.aircraft.engagementState = newState;

    // Notify flight coordinator if available
    const coordinator = this.aircraft.flight?.coordinator;
    if (coordinator) {
      switch (newState) {
        case BVR_STATES.TARGET:
          coordinator.onLockAcquired(this.aircraft, this.target);
          break;
        case BVR_STATES.CRANK:
          coordinator.onCrankStart(this.aircraft);
          break;
        case BVR_STATES.EGRESS:
          if (this.aircraft.isWinchester()) {
            coordinator.emitWinchester(this.aircraft);
          } else if (this.aircraft.isBingoFuel()) {
            coordinator.emitBingo(this.aircraft);
          }
          break;
      }
    }
  }

  /**
   * Execute a command from the player
   */
  executeCommand(command) {
    switch (command.type) {
      case 'SNAP':
      case 'VECTOR':
        this.state = 'VECTORING';
        break;
      case 'ENGAGE':
        if (this.target) {
          this.state = 'INTERCEPT';
        }
        break;
      case 'RTB':
        this.state = 'RTB';
        break;
      case 'DEFENSIVE':
        this.state = 'DEFENSIVE';
        this.defensiveStartTime = this.simulation.time;
        break;
      case 'RECOMMIT':
        if (this.target && this.target.isAlive()) {
          this.state = 'INTERCEPT';
        } else {
          this.state = 'IDLE';
        }
        this.simulation.events.emit('pilot:recommit', { aircraft: this.aircraft });
        break;
    }
  }

  // State handlers

  handleIdle(delta) {
    // In idle state, orbit current position (or maintain heading)
    // Wingmen will follow formation via Aircraft.updateFormationFollow()
  }

  handleVectoring(delta) {
    // Flying assigned heading - nothing special to do
    // Aircraft.update() handles the PID heading control
  }

  handleIntercept(delta) {
    if (!this.target || !this.target.isAlive()) {
      this.target = null;
      this.releaseLock();
      this.state = 'IDLE';
      this.transitionBVRState(BVR_STATES.PATROL);
      return;
    }

    // Calculate intercept heading (pure pursuit)
    const interceptHdg = this.calculateInterceptHeading(this.target);
    this.aircraft.setHeading(interceptHdg);

    // Check range to target
    const distance = this.getRangeToTarget();
    const rangeNm = m2nm(distance);

    // Update engagement phase
    this.aircraft.engagementPhase = 'committed';

    // Ensure BVR state is at least COMMIT when intercepting
    if (this.aircraft.engagementState === BVR_STATES.PATROL ||
        this.aircraft.engagementState === BVR_STATES.DETECTED ||
        this.aircraft.engagementState === BVR_STATES.SORTING) {
      this.transitionBVRState(BVR_STATES.COMMIT);
    }

    // Try to acquire lock when within BVR range
    if (rangeNm < 50) {
      if (this.aircraft.lockedTarget !== this.target) {
        const acquired = this.acquireLock(this.target);
        // Transition to TARGET state when lock acquired
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

    // Check weapons authorization and attempt to fire at BVR range
    // In autonomous mode (BANZAI), treat weapons as always free
    if (this.isWeaponsFree()) {
      const weaponCategory = this.simulation.combat.getOptimalWeapon(this.aircraft, this.target);

      if (weaponCategory && this.canFireMissile()) {
        const launchCheck = this.simulation.combat.canLaunch(
          this.aircraft,
          this.target,
          weaponCategory
        );

        if (launchCheck.canLaunch) {
          this.fireMissile(weaponCategory);
          this.state = 'GUIDING';
          this.aircraft.engagementPhase = 'guiding';
          return;
        } else if (launchCheck.reason === 'TARGET_SATURATED') {
          this.requestNewTarget();
        }
        // Debug: log why we can't launch
        if (!launchCheck.canLaunch) {
          console.log(`${this.aircraft.callsign}: canLaunch=${launchCheck.canLaunch}, reason=${launchCheck.reason}, lock=${!!this.aircraft.lockedTarget}`);
        }
      }
    } else {
      // Weapons hold - request authorization if in range (skip in autonomous mode)
      if (rangeNm < 40 && this.canRequestWeapons() && !this.autonomousMode) {
        this.requestWeaponsFree();
      }
    }

    // Transition to ENGAGE state for close-range combat
    if (rangeNm < 10) {
      this.state = 'ENGAGE';
      this.aircraft.engagementPhase = 'launching';
    }
  }

  handleEngage(delta) {
    if (!this.target || !this.target.isAlive()) {
      this.target = null;
      this.releaseLock();
      this.state = 'IDLE';
      this.aircraft.engagementPhase = 'none';
      return;
    }

    // Continue pursuit while engaged
    const interceptHdg = this.calculateInterceptHeading(this.target);
    this.aircraft.setHeading(interceptHdg);

    const distance = this.getRangeToTarget();
    const rangeNm = m2nm(distance);

    // Try to acquire/maintain lock when in range
    if (rangeNm < 50) {  // Within acquisition range
      if (this.aircraft.lockedTarget !== this.target) {
        this.acquireLock(this.target);
      }
    }

    // Check if lock is maintained (target still in gimbal)
    if (this.aircraft.lockedTarget && !this.isInGimbalLimits(this.aircraft.lockedTarget)) {
      this.releaseLock();
    }

    // Check weapons authorization and firing envelope
    // In autonomous mode (BANZAI), treat weapons as always free
    if (this.isWeaponsFree()) {
      // Check if we can fire
      const weaponCategory = this.simulation.combat.getOptimalWeapon(this.aircraft, this.target);

      if (weaponCategory && this.canFireMissile()) {
        // Use launch discipline check
        const launchCheck = this.simulation.combat.canLaunch(
          this.aircraft,
          this.target,
          weaponCategory
        );

        if (launchCheck.canLaunch) {
          this.fireMissile(weaponCategory);
        } else if (launchCheck.reason === 'TARGET_SATURATED') {
          // Target has enough missiles, try to get a new target from flight sorting
          this.requestNewTarget();
        }
      }
    } else {
      // Weapons hold - request authorization if in range (skip in autonomous mode)
      if (rangeNm < 40 && this.canRequestWeapons() && !this.autonomousMode) {
        this.requestWeaponsFree();
      }
    }
  }

  handleGuiding(delta) {
    if (!this.activeMissile || this.activeMissile.isDead()) {
      // Missile resolved
      this.handleMissileResolution();
      return;
    }

    if (!this.target || !this.target.isAlive()) {
      this.target = null;
      this.releaseLock();
      this.state = 'IDLE';
      this.aircraft.engagementPhase = 'none';
      this.transitionBVRState(BVR_STATES.PATROL);
      return;
    }

    this.missileGuidedTime += delta;
    this.aircraft.engagementPhase = 'guiding';

    // Maintain heading toward target
    const interceptHdg = this.calculateInterceptHeading(this.target);
    this.aircraft.setHeading(interceptHdg);

    // For fox3, check if missile has gone active - can then crank
    if (this.activeMissile.category === 'fox3' && this.activeMissile.isActive()) {
      this.state = 'CRANKING';
      this.aircraft.engagementPhase = 'cranking';
      this.transitionBVRState(BVR_STATES.CRANK);

      // Determine crank direction (away from threat's nose)
      this.crankDirection = this.determineCrankDirection();
    }

    // For fox1, must maintain illumination until impact
    // So we stay in GUIDING state
  }

  handleCranking(delta) {
    if (!this.activeMissile || this.activeMissile.isDead()) {
      // Missile resolved
      this.handleMissileResolution();
      return;
    }

    if (!this.target || !this.target.isAlive()) {
      this.target = null;
      this.releaseLock();
      this.state = 'IDLE';
      this.aircraft.engagementPhase = 'none';
      return;
    }

    // Check if we've lost lock due to gimbal limits (critical for fox1)
    if (this.activeMissile.category === 'fox1') {
      if (!this.isInGimbalLimits(this.target)) {
        // Lost illumination - missile will miss
        this.releaseLock();
      }
    }

    this.missileGuidedTime += delta;
    this.aircraft.engagementPhase = 'cranking';

    // Calculate crank heading - turn to gimbal limit while keeping target in radar
    const bearingToTarget = this.calculateInterceptHeading(this.target);
    const crankHeading = wrapDeg(bearingToTarget + (this.crankDirection * this.gimbalLimit));

    this.aircraft.setHeading(crankHeading);
  }

  handleDefensive(delta) {
    const threats = this.simulation.combat.getThreatsTo(this.aircraft);

    if (threats.length === 0) {
      // No more threats - can recommit
      const defensiveTime = this.simulation.time - this.defensiveStartTime;
      if (defensiveTime > 3) {  // Wait at least 3 seconds before auto-recommit
        if (this.target && this.target.isAlive()) {
          this.state = 'INTERCEPT';
        } else {
          this.state = 'IDLE';
        }
        this.aircraft.engagementPhase = 'none';
        return;
      }
    }

    this.aircraft.engagementPhase = 'notching';

    // Get closest threat and notch it
    const closestThreat = this.simulation.combat.getClosestThreat(this.aircraft);

    if (closestThreat) {
      // Calculate notch heading (perpendicular to threat)
      if (this.notchHeading === null) {
        this.notchHeading = this.calculateNotchHeading(closestThreat);

        // Emit notching event
        this.simulation.events.emit('pilot:notching', {
          aircraft: this.aircraft,
          threat: closestThreat
        });
      }

      this.aircraft.setHeading(this.notchHeading);
    }
  }

  handleRTB(delta) {
    // Future: navigate to home base
    // For now, just reduce speed and maintain heading
    this.aircraft.engagementPhase = 'none';
  }

  // Combat methods

  /**
   * Check if we can fire a missile (cooldown elapsed)
   */
  canFireMissile() {
    const timeSinceLast = this.simulation.time - this.lastMissileLaunchTime;
    return timeSinceLast > 10;  // 10 second cooldown between shots
  }

  /**
   * Fire a missile at the current target
   */
  fireMissile(category) {
    const weaponInfo = this.aircraft.weaponInventory[category];
    if (!weaponInfo || weaponInfo.count <= 0) return;

    const weaponType = weaponInfo.type;

    // Consume weapon from inventory
    this.aircraft.consumeWeapon(category);

    // Launch missile via combat manager
    const missile = this.simulation.combat.launchMissile(
      this.aircraft,
      this.target,
      weaponType
    );

    if (missile) {
      this.activeMissile = missile;
      this.lastMissileLaunchTime = this.simulation.time;
      this.missileGuidedTime = 0;

      // Transition to guiding state
      this.state = 'GUIDING';
      this.aircraft.engagementPhase = 'guiding';

      // BVR state: LAUNCH then immediately to GUIDE
      this.transitionBVRState(BVR_STATES.LAUNCH);
      this.transitionBVRState(BVR_STATES.GUIDE);

      // Notify flight coordinator of launch
      const coordinator = this.aircraft.flight?.coordinator;
      if (coordinator) {
        coordinator.onMissileLaunched(this.aircraft, category, this.target);
      }

      // Emit fox call (legacy event)
      this.simulation.events.emit('pilot:fox', {
        aircraft: this.aircraft,
        type: category,
        target: this.target
      });

      // Auto-pause on missile launch
      if (this.simulation.autoPauseSettings.missileLaunch) {
        this.simulation.triggerAutoPause(`${this.aircraft.callsign} ${missile.getBrevityCode()}`);
      }
    }
  }

  /**
   * Handle missile resolution (hit or miss)
   */
  handleMissileResolution() {
    const hit = this.activeMissile?.state === 'hit';
    const missileTarget = this.activeMissile?.target;

    // Notify flight coordinator
    const coordinator = this.aircraft.flight?.coordinator;
    if (coordinator && this.activeMissile) {
      coordinator.onMissileResolution(this.aircraft, hit, missileTarget);
    }

    if (this.activeMissile) {
      // Emit legacy events
      if (hit) {
        this.simulation.events.emit('pilot:splash', {
          aircraft: this.aircraft,
          target: missileTarget
        });
      } else {
        this.simulation.events.emit('pilot:miss', {
          aircraft: this.aircraft
        });
      }
    }

    this.activeMissile = null;
    this.missileGuidedTime = 0;
    this.notchHeading = null;

    // Transition to RECOMMIT state
    this.transitionBVRState(BVR_STATES.RECOMMIT);

    // Return to engagement if target still alive
    if (this.target && this.target.isAlive()) {
      this.state = 'INTERCEPT';
      this.aircraft.engagementPhase = 'committed';
      // After recommit, transition back to COMMIT
      this.transitionBVRState(BVR_STATES.COMMIT);
    } else {
      this.state = 'IDLE';
      this.aircraft.engagementPhase = 'none';
      this.target = null;
      // Check if should egress (winchester/bingo) or go back to patrol
      if (this.shouldDisengage()) {
        this.transitionBVRState(BVR_STATES.EGRESS);
      } else {
        this.transitionBVRState(BVR_STATES.PATROL);
      }
    }
  }

  /**
   * Check if weapons are effectively free
   * Considers autonomous mode (BANZAI) which allows firing without authorization
   * @returns {boolean}
   */
  isWeaponsFree() {
    // In autonomous mode, always treat as weapons free
    if (this.autonomousMode || this.aircraft.flight?.autonomous) {
      return true;
    }
    return this.aircraft.weaponsAuthorization === 'free';
  }

  /**
   * Check if we can request weapons free (cooldown)
   */
  canRequestWeapons() {
    const timeSinceLast = this.simulation.time - this.lastWeaponsRequest;
    return timeSinceLast > this.weaponsRequestCooldown;
  }

  /**
   * Request weapons free from player
   */
  requestWeaponsFree() {
    this.lastWeaponsRequest = this.simulation.time;

    this.simulation.events.emit('pilot:requestAuth', {
      aircraft: this.aircraft,
      target: this.target
    });
  }

  /**
   * Callback when weapons authorization set to free
   */
  onWeaponsFree() {
    // Can be extended to trigger immediate engagement attempts
  }

  /**
   * Callback when weapons authorization set to hold
   */
  onWeaponsHold() {
    // Can be extended to abort current engagement
  }

  /**
   * Callback when weapons authorization set to tight
   */
  onWeaponsTight() {
    // Weapons tight: only fire on positively identified hostiles
    // Currently treated similar to hold for simplicity
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
    // Choose direction that takes us away from the missile's heading
    const perpRight = wrapDeg(bearingFromMissile + 90);
    const perpLeft = wrapDeg(bearingFromMissile - 90);

    // Pick the heading that results in us moving away from missile track
    // Simple heuristic: pick the one closer to our current heading
    const diffRight = Math.abs(this.normalizeAngle(perpRight - this.aircraft.heading));
    const diffLeft = Math.abs(this.normalizeAngle(perpLeft - this.aircraft.heading));

    return diffRight < diffLeft ? perpRight : perpLeft;
  }

  /**
   * Determine which direction to crank (left or right)
   * Generally turn away from the target's nose
   */
  determineCrankDirection() {
    if (!this.target) return 1;

    // Get target's heading and our relative position
    const dx = this.aircraft.position.x - this.target.position.x;
    const dy = this.aircraft.position.y - this.target.position.y;
    const bearingFromTarget = Math.atan2(dx, dy) * 180 / Math.PI;

    // Calculate which side we're on relative to target's heading
    const angleOff = this.normalizeAngle(bearingFromTarget - this.target.heading);

    // If we're to the right of target's nose, crank right; otherwise left
    return angleOff > 0 ? 1 : -1;
  }

  // Autonomous decisions

  shouldEngageAutonomously() {
    // Only engage autonomously if weapons free
    return this.aircraft.weaponsAuthorization === 'free';
  }

  shouldGoDefensive() {
    // Check for inbound missiles
    const threats = this.simulation.combat.getThreatsTo(this.aircraft);
    if (threats.length === 0) return false;

    // Go defensive if threat is within 20nm
    for (const missile of threats) {
      const range = m2nm(missile.getRangeToTarget());
      if (range < 20) return true;
    }

    return false;
  }

  shouldDisengage() {
    // Future: bingo fuel, winchester
    return this.aircraft.isBingoFuel() || this.aircraft.isWinchester();
  }

  // Target management

  setTarget(target) {
    this.target = target;
    this.state = 'INTERCEPT';
    this.aircraft.engagementPhase = 'committed';
  }

  clearTarget() {
    this.target = null;
    this.releaseLock();
    this.state = 'IDLE';
    this.aircraft.engagementPhase = 'none';
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

  /**
   * Request a new target assignment from flight when current target is saturated
   */
  requestNewTarget() {
    if (!this.aircraft.flight) return;

    const hostiles = this.getNearbyHostiles();
    if (hostiles.length === 0) return;

    const assignments = this.aircraft.flight.sortTargets(hostiles);
    const assigned = assignments.get(this.aircraft);

    if (assigned && assigned !== this.target && assigned.isAlive()) {
      this.setTarget(assigned);
    }
  }

  /**
   * Get nearby hostile aircraft for targeting
   * @returns {Aircraft[]}
   */
  getNearbyHostiles() {
    const hostiles = [];
    const maxRange = 92600;  // 50nm in meters

    for (const flight of this.simulation.hostiles) {
      for (const ac of flight.aircraft) {
        if (!ac.isAlive()) continue;
        const dx = ac.position.x - this.aircraft.position.x;
        const dy = ac.position.y - this.aircraft.position.y;
        if (Math.sqrt(dx * dx + dy * dy) < maxRange) {
          hostiles.push(ac);
        }
      }
    }

    return hostiles;
  }

  selectTarget() {
    // Future: auto-select closest hostile
    return null;
  }

  // Callbacks for weapons authorization changes

  onWeaponsFree() {
    // Could trigger immediate engagement check
  }

  onWeaponsHold() {
    // Could abort current attack if in progress
  }

  // Utility methods

  /**
   * Calculate heading to intercept target (pure pursuit)
   */
  calculateInterceptHeading(target) {
    const dx = target.position.x - this.aircraft.position.x;
    const dy = target.position.y - this.aircraft.position.y;

    // atan2(dx, dy) gives heading in radians where 0 = North
    let heading = Math.atan2(dx, dy) * 180 / Math.PI;
    return wrapDeg(heading);
  }

  /**
   * Get range to current target in meters
   */
  getRangeToTarget() {
    if (!this.target) return Infinity;
    const dx = this.target.position.x - this.aircraft.position.x;
    const dy = this.target.position.y - this.aircraft.position.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Normalize angle to -180 to 180 range
   */
  normalizeAngle(angle) {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  }
}
