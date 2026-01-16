export class Flight {
  constructor(config) {
    this.id = config.id;
    this.callsign = config.callsign;   // 'Viper 1'
    this.aircraft = [];                 // Aircraft in this flight
    this.lead = null;

    this.assignedPatrol = null;
    this.homeBase = null;

    this.commandHistory = [];

    // Combat state
    this.weaponsAuthorization = 'hold';  // 'hold' | 'free' | 'tight'
    this.autonomous = false;             // BANZAI mode - flight handles own decisions

    // Target sorting mode: 'AZIMUTH' | 'LEAD_TRAIL' | 'ASSIGN'
    this.sortingMode = 'AZIMUTH';  // Default for 2-ship

    // Target assignments (explicit via ENGAGE command)
    // Map of aircraftId -> targetAircraft
    this.targetAssignments = new Map();

    // Formation properties
    this.formationType = config.formationType || 'finger-four';
    this.formationSpacing = config.formationSpacing || 500; // meters

    // BVR coordination (initialized separately for friendly flights)
    this.coordinator = null;
  }

  /**
   * Initialize FlightCoordinator for BVR coordination
   * Only for friendly flights (side === 'blue')
   * @param {Simulation} simulation
   */
  initCoordinator(simulation) {
    // Import dynamically to avoid circular dependency
    import('../ai/FlightCoordinator.js').then(({ FlightCoordinator }) => {
      // Only create coordinator for friendly flights
      if (this.aircraft.length > 0 && this.aircraft[0].side === 'blue') {
        this.coordinator = new FlightCoordinator(this, simulation);
      }
    });
  }

  /**
   * Get formation offset for a given position index
   * Returns {x, y} offset in meters relative to lead
   * x = right (positive), y = back (positive)
   */
  getFormationOffset(index) {
    if (index === 0) return { x: 0, y: 0 }; // Lead

    switch (this.formationType) {
      case 'trail':
        // All aircraft directly behind lead
        return { x: 0, y: this.formationSpacing * index };

      case 'echelon-right':
        // Staggered right and back
        return {
          x: this.formationSpacing * 0.7 * index,
          y: this.formationSpacing * 0.7 * index
        };

      case 'echelon-left':
        // Staggered left and back
        return {
          x: -this.formationSpacing * 0.7 * index,
          y: this.formationSpacing * 0.7 * index
        };

      case 'finger-four':
      default:
        // Classic finger-four: 2 on right, 3 on left, 4 on far right
        const fingerOffsets = [
          { x: 0, y: 0 },                                    // Lead
          { x: this.formationSpacing * 0.7, y: this.formationSpacing * 0.5 },  // #2 right wing
          { x: -this.formationSpacing * 0.7, y: this.formationSpacing * 0.5 }, // #3 left wing
          { x: this.formationSpacing * 1.4, y: this.formationSpacing * 1.0 }   // #4 far right
        ];
        return fingerOffsets[index] || { x: 0, y: this.formationSpacing * index };
    }
  }

  addAircraft(aircraft) {
    this.aircraft.push(aircraft);
    aircraft.flight = this;

    // First aircraft added becomes lead
    if (!this.lead) {
      this.lead = aircraft;
      aircraft.isLead = true;
    }
  }

  removeAircraft(aircraft) {
    const index = this.aircraft.indexOf(aircraft);
    if (index !== -1) {
      this.aircraft.splice(index, 1);
      aircraft.flight = null;

      // If lead was removed, promote next aircraft
      if (aircraft === this.lead && this.aircraft.length > 0) {
        this.lead = this.aircraft[0];
        this.lead.isLead = true;
      } else if (this.aircraft.length === 0) {
        this.lead = null;
      }
    }
  }

  getLead() {
    return this.lead;
  }

  getMembers() {
    return [...this.aircraft];
  }

  isAlive() {
    return this.aircraft.some(ac => ac.isAlive());
  }

  getAveragePosition() {
    if (this.aircraft.length === 0) return { x: 0, y: 0 };

    const sum = this.aircraft.reduce((acc, ac) => ({
      x: acc.x + ac.position.x,
      y: acc.y + ac.position.y
    }), { x: 0, y: 0 });

    return {
      x: sum.x / this.aircraft.length,
      y: sum.y / this.aircraft.length
    };
  }

  getAverageFuel() {
    if (this.aircraft.length === 0) return 0;
    const total = this.aircraft.reduce((sum, ac) => sum + ac.fuel, 0);
    return total / this.aircraft.length;
  }

  assignPatrol(pattern) {
    this.assignedPatrol = pattern;
  }

  clearPatrol() {
    this.assignedPatrol = null;
  }

  addCommand(command) {
    this.commandHistory.push({
      command: command,
      timestamp: Date.now()
    });
  }

  getCurrentCommand() {
    if (this.commandHistory.length === 0) return null;
    return this.commandHistory[this.commandHistory.length - 1].command;
  }

  /**
   * Sort and assign targets to flight members based on sorting mode
   * @param {Aircraft[]} hostiles - Array of hostile aircraft to sort
   * @returns {Map<Aircraft, Aircraft>} Map of friendlyAircraft -> assignedTarget
   */
  sortTargets(hostiles) {
    const assignments = new Map();
    const members = this.aircraft.filter(ac => ac.isAlive());
    const targets = hostiles.filter(h => h.isAlive());

    if (members.length === 0 || targets.length === 0) {
      return assignments;
    }

    const flightPos = this.getAveragePosition();

    switch (this.sortingMode) {
      case 'ASSIGN':
        // Use explicit assignments from targetAssignments map
        for (const ac of members) {
          const assigned = this.targetAssignments.get(ac.id);
          if (assigned?.isAlive()) {
            assignments.set(ac, assigned);
          }
        }
        break;

      case 'LEAD_TRAIL':
        // Lead takes nearest, wingmen take farther targets
        const byRange = this.sortByRange(targets, flightPos);
        members.forEach((m, i) => {
          const idx = Math.min(i, byRange.length - 1);
          if (byRange[idx]) {
            assignments.set(m, byRange[idx]);
          }
        });
        break;

      case 'AZIMUTH':
      default:
        // Lead takes left, wing takes right
        const byBearing = this.sortByBearing(targets, this.lead);
        if (members[0] && byBearing[0]) {
          assignments.set(members[0], byBearing[0]);
        }
        if (members[1] && byBearing.length >= 2) {
          assignments.set(members[1], byBearing[byBearing.length - 1]);
        }
        // Additional members take middle targets
        for (let i = 2; i < members.length && i < byBearing.length; i++) {
          assignments.set(members[i], byBearing[Math.floor(i / 2)]);
        }
        break;
    }

    return assignments;
  }

  /**
   * Sort hostiles by range from a position (nearest first)
   * @param {Aircraft[]} hostiles
   * @param {Object} position - {x, y}
   * @returns {Aircraft[]}
   */
  sortByRange(hostiles, position) {
    return [...hostiles].sort((a, b) => {
      const dA = Math.hypot(a.position.x - position.x, a.position.y - position.y);
      const dB = Math.hypot(b.position.x - position.x, b.position.y - position.y);
      return dA - dB;
    });
  }

  /**
   * Sort hostiles by bearing from reference aircraft (leftmost first)
   * @param {Aircraft[]} hostiles
   * @param {Aircraft} refAircraft
   * @returns {Aircraft[]}
   */
  sortByBearing(hostiles, refAircraft) {
    if (!refAircraft) return hostiles;
    return [...hostiles].sort((a, b) =>
      this.relativeBearing(refAircraft, a) - this.relativeBearing(refAircraft, b)
    );
  }

  /**
   * Calculate relative bearing from aircraft to target
   * @param {Aircraft} aircraft
   * @param {Aircraft} target
   * @returns {number} Angle in degrees, -180 to +180 (negative = left)
   */
  relativeBearing(aircraft, target) {
    const dx = target.position.x - aircraft.position.x;
    const dy = target.position.y - aircraft.position.y;
    let rel = (Math.atan2(dx, dy) * 180 / Math.PI) - aircraft.heading;
    while (rel > 180) rel -= 360;
    while (rel < -180) rel += 360;
    return rel;
  }

  /**
   * Explicitly assign a target to an aircraft (ENGAGE command)
   * @param {Aircraft} aircraft
   * @param {Aircraft} target
   */
  assignTarget(aircraft, target) {
    this.targetAssignments.set(aircraft.id, target);
    this.sortingMode = 'ASSIGN';  // Switch to explicit assignment mode
  }

  /**
   * Clear target assignment for an aircraft
   * @param {Aircraft} aircraft
   */
  clearAssignment(aircraft) {
    this.targetAssignments.delete(aircraft.id);
  }

  /**
   * Set sorting mode
   * @param {string} mode - 'AZIMUTH' | 'LEAD_TRAIL' | 'ASSIGN'
   */
  setSortingMode(mode) {
    if (['AZIMUTH', 'LEAD_TRAIL', 'ASSIGN'].includes(mode)) {
      this.sortingMode = mode;
    }
  }
}