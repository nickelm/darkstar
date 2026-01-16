export class CommandExecutor {
  constructor(simulation, comms) {
    this.simulation = simulation;
    this.comms = comms;
  }

  /**
   * Execute a command based on its scope
   * @param {Command} command - The command to execute
   * @returns {boolean} - Whether the command was executed successfully
   */
  execute(command) {
    const scope = command.scope || 'flight';

    // Handle broadcast scope (99 / all aircraft)
    if (scope === 'broadcast') {
      return this.executeBroadcast(command);
    }

    // Handle element scope (single aircraft)
    if (scope === 'element') {
      const aircraft = this.simulation.getAircraftByCallsign(command.callsign);
      if (!aircraft) {
        console.warn(`Unknown aircraft: ${command.callsign}`);
        return false;
      }
      return this.executeForAircraft(aircraft, command);
    }

    // Handle flight scope (default - all aircraft in flight)
    const flight = this.simulation.getFlightByCallsign(command.callsign);
    if (!flight) {
      console.warn(`Unknown flight: ${command.callsign}`);
      return false;
    }

    // Add command to flight history
    flight.addCommand(command);

    return this.executeForFlight(flight, command);
  }

  /**
   * Execute command for all aircraft in a flight
   * @param {Flight} flight - The flight to execute the command for
   * @param {Command} command - The command to execute
   * @returns {boolean}
   */
  executeForFlight(flight, command) {
    switch (command.type) {
      case 'SNAP':
        return this.executeSnap(flight, command.params);
      case 'VECTOR':
        return this.executeVector(flight, command.params);
      case 'BUSTER':
        return this.executeBuster(flight);
      case 'GATE':
        return this.executeGate(flight);
      case 'RTB':
        return this.executeRTB(flight);
      case 'ANGELS':
        return this.executeAngels(flight, command.params);
      case 'ENGAGE':
        return this.executeEngage(flight, command.params);
      case 'WEAPONS_FREE':
        return this.executeWeaponsFree(flight);
      case 'WEAPONS_HOLD':
        return this.executeWeaponsHold(flight);
      case 'DEFENSIVE':
        return this.executeDefensive(flight);
      case 'RECOMMIT':
        return this.executeRecommit(flight);
      case 'RESUME':
        return this.executeResume(flight);
      case 'DISREGARD':
        return this.executeDisregard(flight);
      case 'EXTEND':
        return this.executeExtend(flight);
      case 'PRESS':
        return this.executePress(flight);
      default:
        console.warn(`Unhandled command type: ${command.type}`);
        return false;
    }
  }

  /**
   * Execute command for a single aircraft (element-level command)
   * @param {Aircraft} aircraft - The aircraft to execute the command for
   * @param {Command} command - The command to execute
   * @returns {boolean}
   */
  executeForAircraft(aircraft, command) {
    switch (command.type) {
      case 'SNAP':
        if (command.params.heading === undefined) {
          console.warn('SNAP command missing heading parameter');
          return false;
        }
        aircraft.setHeading(command.params.heading);
        console.log(`${aircraft.callsign}: SNAP ${command.params.heading}`);
        return true;

      case 'VECTOR':
        if (command.params.heading === undefined) {
          console.warn('VECTOR command missing heading parameter');
          return false;
        }
        aircraft.setHeading(command.params.heading);
        console.log(`${aircraft.callsign}: VECTOR ${command.params.heading}`);
        return true;

      case 'BUSTER':
        const maxCruise = aircraft.performance?.speed?.cruise || 450;
        aircraft.setSpeed(maxCruise);
        console.log(`${aircraft.callsign}: BUSTER`);
        return true;

      case 'GATE':
        const maxSpeed = aircraft.performance?.speed?.max || 1000;
        aircraft.setSpeed(maxSpeed);
        console.log(`${aircraft.callsign}: GATE`);
        return true;

      case 'RTB':
        const cruiseSpeed = aircraft.performance?.speed?.cruise || 350;
        aircraft.setSpeed(cruiseSpeed * 0.8);
        console.log(`${aircraft.callsign}: RTB`);
        return true;

      case 'ANGELS':
        if (command.params.altitude === undefined) {
          console.warn('ANGELS command missing altitude parameter');
          return false;
        }
        aircraft.setAltitude(command.params.altitude);
        console.log(`${aircraft.callsign}: ANGELS ${command.params.altitude / 1000}`);
        return true;

      case 'ENGAGE':
        return this.executeEngageForAircraft(aircraft, command.params);

      case 'WEAPONS_FREE':
        aircraft.weaponsAuthorization = 'free';
        if (aircraft.ai && aircraft.ai.onWeaponsFree) {
          aircraft.ai.onWeaponsFree();
        }
        this.simulation.events.emit('weapons:authorization', {
          aircraft,
          state: 'free'
        });
        console.log(`${aircraft.callsign}: WEAPONS FREE`);
        return true;

      case 'WEAPONS_HOLD':
        aircraft.weaponsAuthorization = 'hold';
        if (aircraft.ai && aircraft.ai.onWeaponsHold) {
          aircraft.ai.onWeaponsHold();
        }
        this.simulation.events.emit('weapons:authorization', {
          aircraft,
          state: 'hold'
        });
        console.log(`${aircraft.callsign}: WEAPONS HOLD`);
        return true;

      case 'DEFENSIVE':
        aircraft.aiState = 'defensive';
        aircraft.engagementPhase = 'notching';
        if (aircraft.ai) {
          aircraft.ai.state = 'DEFENSIVE';
          aircraft.ai.defensiveStartTime = this.simulation.time;
          aircraft.ai.notchHeading = null;
        }
        this.simulation.events.emit('command:defensive', { aircraft });
        console.log(`${aircraft.callsign}: DEFENSIVE`);
        return true;

      case 'RECOMMIT':
        if (aircraft.ai) {
          if (aircraft.ai.target && aircraft.ai.target.isAlive()) {
            aircraft.ai.state = 'INTERCEPT';
            aircraft.aiState = 'intercept';
            aircraft.engagementPhase = 'committed';
          } else {
            aircraft.ai.state = 'IDLE';
            aircraft.aiState = 'idle';
            aircraft.engagementPhase = 'none';
          }
          aircraft.ai.notchHeading = null;
        }
        this.simulation.events.emit('pilot:recommit', { aircraft });
        console.log(`${aircraft.callsign}: RECOMMIT`);
        return true;

      case 'RESUME':
        console.log(`${aircraft.callsign}: RESUME`);
        return true;

      case 'DISREGARD':
        console.log(`${aircraft.callsign}: DISREGARD`);
        return true;

      case 'EXTEND':
        // Find merge involving this aircraft and request extend
        const extendMerge = this.simulation.combat.findMergeForAircraft(aircraft);
        if (extendMerge) {
          extendMerge.applyExtend(aircraft.side);
        }
        console.log(`${aircraft.callsign}: EXTEND`);
        return true;

      case 'PRESS':
        // Find merge involving this aircraft and request press
        const pressMerge = this.simulation.combat.findMergeForAircraft(aircraft);
        if (pressMerge) {
          pressMerge.applyPress(aircraft.side);
        }
        console.log(`${aircraft.callsign}: PRESS`);
        return true;

      default:
        console.warn(`Unhandled element command type: ${command.type}`);
        return false;
    }
  }

  /**
   * Execute broadcast command (99 / all aircraft)
   * @param {Command} command - The command to execute
   * @returns {boolean}
   */
  executeBroadcast(command) {
    const flights = this.simulation.getAllFriendlyFlights();
    let anySuccess = false;

    for (const flight of flights) {
      // Create a flight-scoped version of the command for execution
      const flightCommand = { ...command, scope: 'flight', callsign: flight.callsign };
      const success = this.executeForFlight(flight, flightCommand);
      if (success) anySuccess = true;
    }

    console.log(`BROADCAST (99): ${command.type}`);
    return anySuccess;
  }

  /**
   * Execute ENGAGE for a single aircraft
   * @param {Aircraft} aircraft - The aircraft to execute the command for
   * @param {Object} params - Command parameters
   * @returns {boolean}
   */
  executeEngageForAircraft(aircraft, params) {
    const targetCallsign = params.target;
    if (!targetCallsign) {
      console.warn('ENGAGE command missing target parameter');
      return false;
    }

    const targetFlight = this.simulation.getContactById(targetCallsign);
    if (!targetFlight) {
      console.warn(`Unknown target: ${targetCallsign}`);
      return false;
    }

    const targetAircraft = targetFlight.lead || targetFlight.aircraft[0];
    if (!targetAircraft) {
      console.warn(`Target flight has no aircraft: ${targetCallsign}`);
      return false;
    }

    if (aircraft.ai && aircraft.ai.setTarget) {
      aircraft.ai.setTarget(targetAircraft);
    }
    aircraft.aiState = 'intercept';

    console.log(`${aircraft.callsign}: ENGAGE ${targetCallsign}`);
    return true;
  }

  // ============================================
  // Flight-level command executors (existing)
  // ============================================

  executeSnap(flight, params) {
    const heading = params.heading;
    if (heading === undefined || heading === null) {
      console.warn('SNAP command missing heading parameter');
      return false;
    }

    // Apply heading to all aircraft in flight
    for (const aircraft of flight.aircraft) {
      aircraft.setHeading(heading);
    }

    console.log(`${flight.callsign}: SNAP ${heading}`);
    return true;
  }

  executeVector(flight, params) {
    const heading = params.heading;
    if (heading === undefined) {
      console.warn('VECTOR command missing heading parameter');
      return false;
    }

    for (const aircraft of flight.aircraft) {
      aircraft.setHeading(heading);
    }

    console.log(`${flight.callsign}: VECTOR ${heading}`);
    return true;
  }

  executeBuster(flight) {
    // Max cruise speed (no afterburner)
    for (const aircraft of flight.aircraft) {
      const maxCruise = aircraft.performance?.speed?.cruise || 450;
      aircraft.setSpeed(maxCruise);
    }
    console.log(`${flight.callsign}: BUSTER`);
    return true;
  }

  executeGate(flight) {
    // Afterburner - max speed
    for (const aircraft of flight.aircraft) {
      const maxSpeed = aircraft.performance?.speed?.max || 1000;
      aircraft.setSpeed(maxSpeed);
    }
    console.log(`${flight.callsign}: GATE`);
    return true;
  }

  executeEngage(flight, params) {
    const targetCallsign = params.target;
    if (!targetCallsign) {
      console.warn('ENGAGE command missing target parameter');
      return false;
    }

    // Find the target flight (hostile)
    const targetFlight = this.simulation.getContactById(targetCallsign);
    if (!targetFlight) {
      console.warn(`Unknown target: ${targetCallsign}`);
      return false;
    }

    // Get the lead aircraft of the target flight as the primary target
    const targetAircraft = targetFlight.lead || targetFlight.aircraft[0];
    if (!targetAircraft) {
      console.warn(`Target flight has no aircraft: ${targetCallsign}`);
      return false;
    }

    // Assign target to all aircraft in the engaging flight
    for (const aircraft of flight.aircraft) {
      if (aircraft.ai && aircraft.ai.setTarget) {
        aircraft.ai.setTarget(targetAircraft);
      }
      aircraft.aiState = 'intercept';
    }

    console.log(`${flight.callsign}: ENGAGE ${targetCallsign}`);
    return true;
  }

  executeWeaponsFree(flight) {
    // Set weapons authorization for flight and all aircraft
    flight.weaponsAuthorization = 'free';

    for (const aircraft of flight.aircraft) {
      aircraft.weaponsAuthorization = 'free';

      // Notify AI of weapons free status
      if (aircraft.ai && aircraft.ai.onWeaponsFree) {
        aircraft.ai.onWeaponsFree();
      }
    }

    // Emit event for UI/voice feedback
    this.simulation.events.emit('weapons:authorization', {
      flight,
      state: 'free'
    });

    console.log(`${flight.callsign}: WEAPONS FREE`);
    return true;
  }

  executeWeaponsHold(flight) {
    // Set weapons authorization for flight and all aircraft
    flight.weaponsAuthorization = 'hold';

    for (const aircraft of flight.aircraft) {
      aircraft.weaponsAuthorization = 'hold';

      // Notify AI of weapons hold status
      if (aircraft.ai && aircraft.ai.onWeaponsHold) {
        aircraft.ai.onWeaponsHold();
      }
    }

    // Emit event for UI/voice feedback
    this.simulation.events.emit('weapons:authorization', {
      flight,
      state: 'hold'
    });

    console.log(`${flight.callsign}: WEAPONS HOLD`);
    return true;
  }

  executeDefensive(flight) {
    // Set all aircraft in flight to defensive state
    for (const aircraft of flight.aircraft) {
      aircraft.aiState = 'defensive';
      aircraft.engagementPhase = 'notching';

      // Notify AI to go defensive
      if (aircraft.ai) {
        aircraft.ai.state = 'DEFENSIVE';
        aircraft.ai.defensiveStartTime = this.simulation.time;
        aircraft.ai.notchHeading = null;  // Will be calculated on next update
      }
    }

    // Emit event for UI/voice feedback
    this.simulation.events.emit('command:defensive', { flight });

    console.log(`${flight.callsign}: DEFENSIVE`);
    return true;
  }

  executeRecommit(flight) {
    // Resume attack after defensive
    for (const aircraft of flight.aircraft) {
      if (aircraft.ai) {
        // If we have a target, go back to intercept; otherwise idle
        if (aircraft.ai.target && aircraft.ai.target.isAlive()) {
          aircraft.ai.state = 'INTERCEPT';
          aircraft.aiState = 'intercept';
          aircraft.engagementPhase = 'committed';
        } else {
          aircraft.ai.state = 'IDLE';
          aircraft.aiState = 'idle';
          aircraft.engagementPhase = 'none';
        }
        aircraft.ai.notchHeading = null;
      }
    }

    // Emit event for UI/voice feedback
    this.simulation.events.emit('pilot:recommit', { flight });

    console.log(`${flight.callsign}: RECOMMIT`);
    return true;
  }

  executeRTB(flight) {
    // For Phase 2, just slow down and maintain course
    for (const aircraft of flight.aircraft) {
      const cruiseSpeed = aircraft.performance?.speed?.cruise || 350;
      aircraft.setSpeed(cruiseSpeed * 0.8);
    }
    console.log(`${flight.callsign}: RTB`);
    return true;
  }

  executeAngels(flight, params) {
    const altitude = params.altitude;
    if (altitude === undefined) {
      console.warn('ANGELS command missing altitude parameter');
      return false;
    }

    for (const aircraft of flight.aircraft) {
      aircraft.setAltitude(altitude);
    }
    console.log(`${flight.callsign}: ANGELS ${altitude / 1000}`);
    return true;
  }

  executeResume(flight) {
    // Future implementation
    console.log(`${flight.callsign}: RESUME`);
    return true;
  }

  executeDisregard(flight) {
    // Future implementation - cancel last command
    console.log(`${flight.callsign}: DISREGARD`);
    return true;
  }

  executeScramble() {
    // Future implementation
    return false;
  }

  executeBogeyDope(flight) {
    // Future implementation
    console.log(`${flight.callsign}: BOGEY DOPE request`);
    return true;
  }

  executePicture() {
    // Future implementation
    console.log('PICTURE request');
    return true;
  }

  executeExtend(flight) {
    // Request disengage from merge for this flight
    this.simulation.combat.requestExtend(flight);

    // Emit event for UI/voice feedback
    this.simulation.events.emit('command:extend', { flight });

    console.log(`${flight.callsign}: EXTEND`);
    return true;
  }

  executePress(flight) {
    // Request aggressive posture in merge for this flight
    this.simulation.combat.requestPress(flight);

    // Emit event for UI/voice feedback
    this.simulation.events.emit('command:press', { flight });

    console.log(`${flight.callsign}: PRESS`);
    return true;
  }
}
