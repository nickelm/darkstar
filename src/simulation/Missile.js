import { PIDController } from '../util/pid.js';

export class Missile {
  constructor(config) {
    this.id = config.id;
    this.type = config.type;           // 'AIM-120C', 'R-27R', etc.
    this.category = config.category;   // 'fox1', 'fox2', 'fox3'
    
    this.shooter = config.shooter;
    this.target = config.target;
    
    this.position = { x: 0, y: 0 };
    this.altitude = 0;
    this.heading = 0;
    this.speed = 0;
    
    this.state = 'flight';  // 'flight', 'active', 'terminal', 'hit', 'miss'
    this.timeOfFlight = 0;
    this.maxDuration = 60;
    
    // Guidance
    this.guidancePID = null;
    this.needsIllumination = false;  // True for fox1
  }

  init() {}
  update(delta) {}
  
  checkIntercept() {}    // Returns true if reached target
  calculatePk() {}       // Probability of kill
  resolve() {}           // Roll for hit/miss
  
  hasLock() {}
  isActive() {}
  isDead() {}
}