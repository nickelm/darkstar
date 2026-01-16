import { GeoReference } from './GeoReference.js';
import { Flight } from './Flight.js';
import { Aircraft } from './Aircraft.js';
import { PilotAI } from '../ai/PilotAI.js';
import { EnemyAI } from '../ai/EnemyAI.js';
import { EventEmitter } from '../util/EventEmitter.js';
import { Combat } from './Combat.js';
// WaveManager commented out for Phase 2
// import { Airbase } from './Airbase.js';
// import { WaveManager } from '../scenario/WaveManager.js';

// Bandit ID letters for naming hostile flights
const BANDIT_LETTERS = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot',
  'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima'
];

// Distance in meters for merge detection (~5nm)
const MERGE_DISTANCE = 9260;

export class Simulation {
  constructor() {
    // Event emitter for game events
    this.events = new EventEmitter();

    this.time = 0;
    this.speed = 1; // 1, 2, 4
    this.paused = false;
    this.geoRef = null;

    this.flights = [];      // Friendly flights
    this.hostiles = [];     // Enemy flights
    this.missiles = [];
    this.airbases = [];

    this.bullseye = { lat: 0, lon: 0 };
    this.banditCounter = 0; // For assigning Bandit IDs

    // Auto-pause settings
    this.autoPauseSettings = {
      newContact: true,
      missileLaunch: true,
      merge: true,
      bingo: false
    };

    // Track previous state for detecting changes
    this.previousHostileCount = 0;
    this.mergeAnnounced = new Set(); // Track pairs that have merged
    this.autoPauseReason = null; // Last auto-pause reason

    // Combat system
    this.combat = new Combat(this);
    // this.waveManager = null;
  }

  loadScenario(scenarioData) {
    // Set up bullseye and geo reference
    this.bullseye = scenarioData.bullseye;
    this.geoRef = new GeoReference(this.bullseye.lat, this.bullseye.lon);
    this.banditCounter = 0;

    // Create friendly flights from scenario
    if (scenarioData.flights) {
      for (const flightData of scenarioData.flights) {
        const flight = this.createFlight({ ...flightData, side: 'blue' });
        this.addFlight(flight);
      }
    }

    // Create hostile flights from scenario
    if (scenarioData.hostiles) {
      for (const hostileData of scenarioData.hostiles) {
        const flight = this.createFlight({ ...hostileData, side: 'red' });
        // Assign bandit callsign if not provided
        if (!hostileData.callsign) {
          flight.callsign = this.assignBanditCallsign();
        }
        this.addHostile(flight);
      }
    }

    this.time = 0;
    this.paused = false;

    // Reset auto-pause tracking state
    this.previousHostileCount = this.hostiles.reduce((sum, f) => sum + f.aircraft.length, 0);
    this.mergeAnnounced.clear();
    this.autoPauseReason = null;
  }

  /**
   * Assign a bandit callsign (Bandit Alpha, Bandit Bravo, etc.)
   */
  assignBanditCallsign() {
    const letter = BANDIT_LETTERS[this.banditCounter % BANDIT_LETTERS.length];
    this.banditCounter++;
    return `Bandit ${letter}`;
  }

  createFlight(flightData) {
    const flight = new Flight({
      id: flightData.id || `flight_${Date.now()}`,
      callsign: flightData.callsign
    });

    // Convert flight position to local coordinates
    const localPos = this.geoRef.toLocal(flightData.position.lat, flightData.position.lon);
    const side = flightData.side || 'blue';

    // Create aircraft for the flight
    const count = flightData.count || 2;
    for (let i = 0; i < count; i++) {
      const aircraft = new Aircraft({
        id: `${flightData.callsign}-${i + 1}`,
        callsign: `${flightData.callsign}-${i + 1}`,
        type: flightData.type,
        side: side
      });

      // Set geo reference
      aircraft.geoRef = this.geoRef;

      // Set formation index for wingman behavior
      aircraft.formationIndex = i;

      // Get formation offset from flight (uses finger-four by default)
      const offset = flight.getFormationOffset(i);
      const headingRad = flightData.heading * Math.PI / 180;

      // Rotate offset by heading to get world position
      aircraft.position = {
        x: localPos.x + offset.x * Math.cos(headingRad) - offset.y * Math.sin(headingRad),
        y: localPos.y + offset.x * Math.sin(headingRad) + offset.y * Math.cos(headingRad)
      };

      aircraft.heading = flightData.heading;
      aircraft.altitude = flightData.altitude;
      aircraft.speed = flightData.speed;

      aircraft.init();

      // Create AI controller based on side
      if (side === 'red') {
        aircraft.ai = new EnemyAI(aircraft, this);
      } else {
        aircraft.ai = new PilotAI(aircraft, this);
      }

      flight.addAircraft(aircraft);
    }

    return flight;
  }

  update(delta) {
    if (this.paused) return;

    // Apply time multiplier
    const scaledDelta = delta * this.speed;
    this.time += scaledDelta;

    // Update all friendly aircraft
    for (const flight of this.flights) {
      for (const aircraft of flight.aircraft) {
        aircraft.update(scaledDelta);
      }
    }

    // Update hostiles
    for (const flight of this.hostiles) {
      for (const aircraft of flight.aircraft) {
        aircraft.update(scaledDelta);
      }
    }

    // Update combat system (missiles, merges)
    this.combat.update(scaledDelta);

    // Check auto-pause triggers
    this.checkAutoPauseTriggers();
  }

  /**
   * Check for conditions that should trigger auto-pause
   */
  checkAutoPauseTriggers() {
    // New contact detection
    if (this.autoPauseSettings.newContact) {
      const currentCount = this.hostiles.reduce((sum, f) => sum + f.aircraft.length, 0);
      if (currentCount > this.previousHostileCount && this.previousHostileCount > 0) {
        const newCount = currentCount - this.previousHostileCount;
        this.events.emit('contact:new', { count: newCount });
        this.triggerAutoPause(`New hostile contact detected`);
      }
      this.previousHostileCount = currentCount;
    }

    // Bingo fuel detection (for friendly aircraft)
    if (this.autoPauseSettings.bingo) {
      for (const flight of this.flights) {
        for (const aircraft of flight.aircraft) {
          if (aircraft.isBingoFuel && aircraft.isBingoFuel() && !aircraft._bingoAnnounced) {
            aircraft._bingoAnnounced = true;
            this.events.emit('bingo', { aircraft });
            this.triggerAutoPause(`${aircraft.callsign} is BINGO fuel`);
          }
        }
      }
    }

    // Merge detection - when friendly and hostile < 5nm apart
    if (this.autoPauseSettings.merge) {
      for (const friendlyFlight of this.flights) {
        for (const friendly of friendlyFlight.aircraft) {
          for (const hostileFlight of this.hostiles) {
            for (const hostile of hostileFlight.aircraft) {
              const pairKey = `${friendly.id}:${hostile.id}`;
              if (this.mergeAnnounced.has(pairKey)) continue;

              const dx = friendly.position.x - hostile.position.x;
              const dy = friendly.position.y - hostile.position.y;
              const distance = Math.sqrt(dx * dx + dy * dy);

              if (distance < MERGE_DISTANCE) {
                this.mergeAnnounced.add(pairKey);
                this.events.emit('merge', { friendly, hostile, distance });
                this.triggerAutoPause(`MERGE: ${friendly.callsign} and ${hostile.flight?.callsign || 'hostile'}`);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Trigger auto-pause with a reason
   * @param {string} reason
   */
  triggerAutoPause(reason) {
    if (!this.paused) {
      this.paused = true;
      this.autoPauseReason = reason;
      this.events.emit('autopause', { reason });
    }
  }

  /**
   * Set an auto-pause setting
   * @param {string} key - 'newContact', 'missileLaunch', 'merge', 'bingo'
   * @param {boolean} value
   */
  setAutoPauseSetting(key, value) {
    if (key in this.autoPauseSettings) {
      this.autoPauseSettings[key] = value;
    }
  }

  /**
   * Get all auto-pause settings
   * @returns {Object}
   */
  getAutoPauseSettings() {
    return { ...this.autoPauseSettings };
  }

  addFlight(flight) {
    this.flights.push(flight);
  }

  removeFlight(flight) {
    const index = this.flights.indexOf(flight);
    if (index !== -1) {
      this.flights.splice(index, 1);
    }
  }

  addHostile(flight) {
    this.hostiles.push(flight);
  }

  removeHostile(flight) {
    const index = this.hostiles.indexOf(flight);
    if (index !== -1) {
      this.hostiles.splice(index, 1);
    }
  }

  /**
   * Get all hostile flights (contacts)
   */
  getAllContacts() {
    return [...this.hostiles];
  }

  /**
   * Get a contact by callsign (e.g., "Bandit Alpha")
   */
  getContactById(callsign) {
    const normalized = callsign.toLowerCase().replace(/[- ]/g, '');
    for (const flight of this.hostiles) {
      const flightNorm = flight.callsign.toLowerCase().replace(/[- ]/g, '');
      if (flightNorm === normalized) {
        return flight;
      }
    }
    return null;
  }

  addMissile(missile) {
    this.missiles.push(missile);
  }

  removeMissile(missile) {
    const index = this.missiles.indexOf(missile);
    if (index !== -1) {
      this.missiles.splice(index, 1);
    }
  }

  getFlightByCallsign(callsign) {
    // Normalize callsign for comparison
    const normalized = callsign.toLowerCase().replace(/[- ]/g, '');

    for (const flight of this.flights) {
      const flightNorm = flight.callsign.toLowerCase().replace(/[- ]/g, '');
      // Exact match only - no prefix matching (element callsigns handled separately)
      if (flightNorm === normalized) {
        return flight;
      }
    }

    // Also check hostiles
    for (const flight of this.hostiles) {
      const flightNorm = flight.callsign.toLowerCase().replace(/[- ]/g, '');
      if (flightNorm === normalized) {
        return flight;
      }
    }

    return null;
  }

  /**
   * Get a specific aircraft by element callsign (e.g., "Viper 1-1")
   * @param {string} callsign - Element callsign
   * @returns {Aircraft|null}
   */
  getAircraftByCallsign(callsign) {
    const normalized = callsign.toLowerCase().replace(/[- ]/g, '');

    for (const flight of this.flights) {
      for (const aircraft of flight.aircraft) {
        const acNorm = aircraft.callsign.toLowerCase().replace(/[- ]/g, '');
        if (acNorm === normalized) {
          return aircraft;
        }
      }
    }

    // Also check hostiles
    for (const flight of this.hostiles) {
      for (const aircraft of flight.aircraft) {
        const acNorm = aircraft.callsign.toLowerCase().replace(/[- ]/g, '');
        if (acNorm === normalized) {
          return aircraft;
        }
      }
    }

    return null;
  }

  /**
   * Get all friendly flights (for broadcast commands)
   * @returns {Flight[]}
   */
  getAllFriendlyFlights() {
    return [...this.flights];
  }

  getAllAircraft() {
    const all = [];
    for (const flight of this.flights) {
      all.push(...flight.aircraft);
    }
    for (const flight of this.hostiles) {
      all.push(...flight.aircraft);
    }
    return all;
  }

  getHostilesInRange(position, range) {
    // Future implementation
    return [];
  }

  setSpeed(speed) {
    this.speed = Math.max(1, Math.min(4, speed));
  }

  togglePause() {
    this.paused = !this.paused;
    return this.paused;
  }

  shouldAutoPause() {
    // Future implementation
    return false;
  }

  toLocal(lat, lon) {
    return this.geoRef ? this.geoRef.toLocal(lat, lon) : { x: 0, y: 0 };
  }

  toGeo(x, y) {
    return this.geoRef ? this.geoRef.toGeo(x, y) : { lat: 0, lon: 0 };
  }
}