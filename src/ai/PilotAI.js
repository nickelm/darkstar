import { wrapDeg, m2nm } from '../util/math.js';

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

    // Cranking parameters
    this.crankDirection = 1;  // 1 = right, -1 = left
    this.gimbalLimit = 60;    // degrees
  }

  update(delta) {
    // Check for threats before normal state handling
    if (this.shouldGoDefensive()) {
      if (this.state !== 'DEFENSIVE') {
        this.state = 'DEFENSIVE';
        this.defensiveStartTime = this.simulation.time;
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
      this.state = 'IDLE';
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

    // Check if within engagement range (10nm = ~18.5km)
    if (rangeNm < 10) {
      // Close enough to engage
      this.state = 'ENGAGE';
      this.aircraft.engagementPhase = 'launching';
    }
  }

  handleEngage(delta) {
    if (!this.target || !this.target.isAlive()) {
      this.target = null;
      this.state = 'IDLE';
      this.aircraft.engagementPhase = 'none';
      return;
    }

    // Continue pursuit while engaged
    const interceptHdg = this.calculateInterceptHeading(this.target);
    this.aircraft.setHeading(interceptHdg);

    const distance = this.getRangeToTarget();
    const rangeNm = m2nm(distance);

    // Check weapons authorization and firing envelope
    if (this.aircraft.weaponsAuthorization === 'free') {
      // Check if we can fire
      const weaponCategory = this.simulation.combat.getOptimalWeapon(this.aircraft, this.target);

      if (weaponCategory && this.canFireMissile()) {
        this.fireMissile(weaponCategory);
      }
    } else {
      // Weapons hold - request authorization if in range
      if (rangeNm < 40 && this.canRequestWeapons()) {
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
      this.state = 'IDLE';
      this.aircraft.engagementPhase = 'none';
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
      this.state = 'IDLE';
      this.aircraft.engagementPhase = 'none';
      return;
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
    return timeSinceLast > 5;  // 5 second cooldown between shots
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

      // Emit fox call
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
    if (this.activeMissile) {
      const result = this.activeMissile.state;

      if (result === 'hit') {
        this.simulation.events.emit('pilot:splash', {
          aircraft: this.aircraft,
          target: this.activeMissile.target
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

    // Return to engagement if target still alive
    if (this.target && this.target.isAlive()) {
      this.state = 'INTERCEPT';
      this.aircraft.engagementPhase = 'committed';
    } else {
      this.state = 'IDLE';
      this.aircraft.engagementPhase = 'none';
      this.target = null;
    }
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
    this.state = 'IDLE';
    this.aircraft.engagementPhase = 'none';
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
