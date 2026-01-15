import { wrapDeg } from '../util/math.js';

/**
 * AI controller for friendly pilot aircraft
 * Handles state machine for IDLE, VECTORING, INTERCEPT, ENGAGE states
 */
export class PilotAI {
  constructor(aircraft, simulation) {
    this.aircraft = aircraft;
    this.simulation = simulation;
    this.state = 'IDLE';
    this.target = null;
  }

  update(delta) {
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
        break;
      case 'RECOMMIT':
        if (this.target) {
          this.state = 'INTERCEPT';
        } else {
          this.state = 'IDLE';
        }
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

    // Check if within engagement range (10nm = ~18.5km)
    const dx = this.target.position.x - this.aircraft.position.x;
    const dy = this.target.position.y - this.aircraft.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 18500) {
      // Close enough to engage
      this.state = 'ENGAGE';
    }
  }

  handleEngage(delta) {
    if (!this.target || !this.target.isAlive()) {
      this.target = null;
      this.state = 'IDLE';
      return;
    }

    // Continue pursuit while engaged
    const interceptHdg = this.calculateInterceptHeading(this.target);
    this.aircraft.setHeading(interceptHdg);

    // Future: weapon employment logic
  }

  handleDefensive(delta) {
    // Future: evasive maneuvering
    // For now, just stay in this state until RECOMMIT
  }

  handleRTB(delta) {
    // Future: navigate to home base
    // For now, just reduce speed and maintain heading
  }

  // Autonomous decisions

  shouldEngageAutonomously() {
    // Future: weapons free logic
    return false;
  }

  shouldGoDefensive() {
    // Future: detect inbound missiles
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
  }

  clearTarget() {
    this.target = null;
    this.state = 'IDLE';
  }

  selectTarget() {
    // Future: auto-select closest hostile
    return null;
  }

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
}
