import { GeoReference } from './GeoReference.js';
import { Flight } from './Flight.js';
import { Airbase } from './Airbase.js';
import { Combat } from './Combat.js';
import { WaveManager } from '../scenario/WaveManager.js';

export class Simulation {
  constructor() {
    this.time = 0;
    this.speed = 1; // 1, 2, 4
    this.paused = false;
    this.geoRef = null;
    
    this.flights = [];      // Friendly flights
    this.hostiles = [];     // Enemy flights
    this.missiles = [];
    this.airbases = [];
    
    this.bullseye = { lat: 0, lon: 0 };
    
    this.combat = new Combat(this);
    this.waveManager = null;
  }

  loadScenario(scenarioData) {}
  
  update(delta) {}
  
  addFlight(flight) {}
  removeFlight(flight) {}
  
  addMissile(missile) {}
  removeMissile(missile) {}
  
  getFlightByCallsign(callsign) {}
  getAllAircraft() {}
  getHostilesInRange(position, range) {}
  
  setSpeed(speed) {}
  togglePause() {}
  shouldAutoPause() {}
  
  toLocal(lat, lon) {}
  toGeo(x, y) {}
}