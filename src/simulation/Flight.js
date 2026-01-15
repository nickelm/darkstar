export class Flight {
  constructor(config) {
    this.id = config.id;
    this.callsign = config.callsign;   // 'Viper 1'
    this.aircraft = [];                 // Aircraft in this flight
    this.lead = null;

    this.assignedPatrol = null;
    this.homeBase = null;

    this.commandHistory = [];

    // Formation properties
    this.formationType = config.formationType || 'finger-four';
    this.formationSpacing = config.formationSpacing || 500; // meters
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
}