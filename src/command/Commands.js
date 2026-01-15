export const COMMANDS = {
  SNAP: {
    name: 'SNAP',
    params: ['heading'],
    description: 'Immediate turn to heading',
    validate: (params) => {}
  },
  VECTOR: {
    name: 'VECTOR',
    params: ['heading'],
    description: 'Turn to heading'
  },
  BUSTER: {
    name: 'BUSTER',
    params: [],
    description: 'Max cruise speed'
  },
  GATE: {
    name: 'GATE',
    params: [],
    description: 'Afterburner'
  },
  ENGAGE: {
    name: 'ENGAGE',
    params: ['target'],
    description: 'Engage specified target'
  },
  WEAPONS_FREE: {
    name: 'WEAPONS_FREE',
    params: [],
    description: 'Cleared to fire'
  },
  WEAPONS_HOLD: {
    name: 'WEAPONS_HOLD',
    params: [],
    description: 'Do not fire'
  },
  DEFENSIVE: {
    name: 'DEFENSIVE',
    params: [],
    description: 'Go defensive, evade'
  },
  RECOMMIT: {
    name: 'RECOMMIT',
    params: [],
    description: 'Resume attack after defensive'
  },
  RTB: {
    name: 'RTB',
    params: [],
    description: 'Return to base'
  },
  ANGELS: {
    name: 'ANGELS',
    params: ['altitude'],
    description: 'Fly to altitude (thousands)'
  },
  BOGEY_DOPE: {
    name: 'BOGEY_DOPE',
    params: [],
    description: 'Request nearest threat'
  },
  PICTURE: {
    name: 'PICTURE',
    params: [],
    description: 'Request tactical picture'
  },
  RESUME: {
    name: 'RESUME',
    params: [],
    description: 'Return to assigned patrol'
  },
  DISREGARD: {
    name: 'DISREGARD',
    params: [],
    description: 'Cancel last command'
  },
  SCRAMBLE: {
    name: 'SCRAMBLE',
    params: ['flight'],
    description: 'Launch alert fighters'
  }
};

export class Command {
  constructor(callsign, commandType, params = {}) {
    this.id = Date.now() + Math.random();
    this.callsign = callsign;
    this.type = commandType;
    this.params = params;
    this.timestamp = null;
  }

  toString() {
    let str = `${this.callsign}, ${this.type}`;

    if (this.params.heading !== undefined) {
      str += ` ${this.params.heading.toString().padStart(3, '0')}`;
    }
    if (this.params.altitude !== undefined) {
      str += ` ${Math.round(this.params.altitude / 1000)}`;
    }
    if (this.params.target !== undefined) {
      str += ` ${this.params.target}`;
    }

    return str;
  }

  validate() {
    const def = COMMANDS[this.type];
    if (!def) return { valid: false, error: 'Unknown command type' };

    // Check required parameters
    for (const param of def.params) {
      if (this.params[param] === undefined) {
        return { valid: false, error: `Missing parameter: ${param}` };
      }
    }

    // Type-specific validation
    if (this.type === 'SNAP' || this.type === 'VECTOR') {
      const h = this.params.heading;
      if (h < 0 || h > 360) {
        return { valid: false, error: 'Heading must be 0-360' };
      }
    }

    return { valid: true };
  }
}