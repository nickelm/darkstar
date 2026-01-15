import { PIDController } from '../util/pid.js';
import { getVelocity, braa } from '../util/math.js';

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
    
    // Weapons
    this.weapons = [];
    
    // Control
    this.headingPID = null;
    this.altitudePID = null;
    this.speedPID = null;
    
    // AI state
    this.aiState = 'idle';
    this.currentCommand = null;
    this.target = null;
    
    // Flight membership
    this.flight = null;
    this.isLead = false;
  }

  init() {}              // Initialize PID controllers
  update(delta) {}       // Update physics, consume fuel
  
  setHeading(heading) {}
  setAltitude(altitude) {}
  setSpeed(speed) {}
  
  getPosition() {}       // Returns { lat, lon }
  getVelocity() {}       // Returns velocity vector
  
  launchWeapon(type, target) {}
  
  isAlive() {}
  isBingoFuel() {}
  isWinchester() {}
}