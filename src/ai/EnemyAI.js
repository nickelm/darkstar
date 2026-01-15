import { wrapDeg } from '../util/math.js';

/**
 * AI controller for hostile aircraft
 * Handles state machine for INGRESS, ENGAGE, EGRESS states
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
  }

  update(delta) {
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

    // Future: weapon employment, BVR logic
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
    // Future: evasive maneuvering
    // For now, just try to turn away from threat
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

  shouldEvade(threat) {
    // Future: check if threat is shooting at us
    return false;
  }

  shouldNotch(missile) {
    // Future: notch incoming missiles
    return false;
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
