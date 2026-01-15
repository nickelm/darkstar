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
    this.id = null;
    this.callsign = callsign;
    this.type = commandType;
    this.params = params;
    this.timestamp = null;
  }

  toString() {}          // "Viper 1-1, snap 270"
  validate() {}
}