import { wrapDeg, m2nm } from '../util/math.js';

/**
 * AI controller for hostile aircraft
 * Handles state machine for INGRESS, ENGAGE, EGRESS, DEFENSIVE states
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
  }

  update(delta) {
    // Check for threats before normal state handling
    if (this.shouldGoDefensive()) {
      if (this.state !== 'DEFENSIVE') {
        this.state = 'DEFENSIVE';
        this.defensiveStartTime = this.simulation.time;
        this.notchHeading = null;
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
  }

  // State handlers

  handleIngress(delta) {
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
    }
  }

  handleEngage(delta) {
    if (!this.engageTarget || !this.engageTarget.isAlive()) {
      this.engageTarget = null;
      this.state = 'INGRESS';
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

    // Enemy AI is always weapons free - fire when in envelope
    if (this.canFireMissile() && this.isInFiringEnvelope(rangeNm)) {
      this.fireMissile();
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
    if (timeSinceLast < 5) return false;  // 5 second cooldown

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
