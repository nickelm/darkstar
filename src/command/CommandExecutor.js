export class CommandExecutor {
  constructor(simulation, comms) {
    this.simulation = simulation;
    this.comms = comms;
  }

  execute(command) {
    const flight = this.simulation.getFlightByCallsign(command.callsign);
    if (!flight) {
      console.warn(`Unknown flight: ${command.callsign}`);
      return false;
    }

    // Add command to flight history
    flight.addCommand(command);

    // Dispatch to specific executor
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
      default:
        console.warn(`Unhandled command type: ${command.type}`);
        return false;
    }
  }

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
      const maxCruise = aircraft.performance.speed?.cruise || 450;
      aircraft.setSpeed(maxCruise);
    }
    console.log(`${flight.callsign}: BUSTER`);
    return true;
  }

  executeGate(flight) {
    // Afterburner - max speed
    for (const aircraft of flight.aircraft) {
      const maxSpeed = aircraft.performance.speed?.max || 1000;
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
    // Future implementation
    console.log(`${flight.callsign}: WEAPONS FREE`);
    return true;
  }

  executeWeaponsHold(flight) {
    // Future implementation
    console.log(`${flight.callsign}: WEAPONS HOLD`);
    return true;
  }

  executeDefensive(flight) {
    // Future implementation
    console.log(`${flight.callsign}: DEFENSIVE`);
    return true;
  }

  executeRecommit(flight) {
    // Future implementation
    console.log(`${flight.callsign}: RECOMMIT`);
    return true;
  }

  executeRTB(flight) {
    // For Phase 2, just slow down and maintain course
    for (const aircraft of flight.aircraft) {
      const cruiseSpeed = aircraft.performance.speed?.cruise || 350;
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

  executeScramble(airbase, params) {
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
}