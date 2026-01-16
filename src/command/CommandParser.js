import { COMMANDS, Command } from './Commands.js';

export class CommandParser {
  constructor() {
    this.callsigns = [];   // Known callsigns
    this.targets = [];     // Known target designations
  }

  setCallsigns(callsigns) {
    this.callsigns = callsigns;
  }

  setTargets(targets) {
    this.targets = targets;
  }

  parse(input) {
    const normalized = input.trim().toUpperCase();

    // Split on "BREAK" for multiple commands
    const segments = normalized.split(/\s*,?\s*BREAK\s*,?\s*/);

    const commands = [];
    let currentCallsign = null;

    for (const segment of segments) {
      const cmd = this.parseSegment(segment, currentCallsign);
      if (cmd) {
        currentCallsign = cmd.callsign;
        commands.push(cmd);
      }
    }

    return commands;
  }

  parseSegment(segment, defaultCallsign) {
    if (!segment.trim()) return null;

    // Extract callsign (if present)
    let callsign = this.extractCallsign(segment);
    if (!callsign) {
      callsign = defaultCallsign;
    }

    if (!callsign) return null;

    // Extract command type
    const commandType = this.extractCommand(segment);
    if (!commandType) return null;

    // Extract parameters based on command type
    const params = {};

    if (commandType === 'SNAP' || commandType === 'VECTOR') {
      const heading = this.extractHeading(segment);
      if (heading !== null) {
        params.heading = heading;
      }
    } else if (commandType === 'ANGELS') {
      const altitude = this.extractAltitude(segment);
      if (altitude !== null) {
        params.altitude = altitude;
      }
    } else if (commandType === 'ENGAGE') {
      const target = this.extractTarget(segment);
      if (target !== null) {
        params.target = target;
      }
    }

    return new Command(callsign, commandType, params);
  }

  extractCallsign(text) {
    // Try to match known callsigns
    for (const callsign of this.callsigns) {
      const pattern = new RegExp(callsign.replace(/[- ]/g, '[- ]?'), 'i');
      if (pattern.test(text)) {
        return callsign;
      }
    }

    // Try generic pattern: WORD + NUMBER
    const match = text.match(/^([A-Z]+)\s*(\d+(?:-\d+)?)/);
    if (match) {
      return `${match[1]} ${match[2]}`;
    }

    return null;
  }

  extractCommand(text) {
    const commandPatterns = {
      'SNAP': /\bSNAP\b/i,
      'VECTOR': /\bVECTOR\b/i,
      'BUSTER': /\bBUSTER\b/i,
      'GATE': /\bGATE\b/i,
      'RTB': /\bRTB\b/i,
      'ANGELS': /\bANGELS\b/i,
      'WEAPONS_FREE': /\bWEAPONS?\s*FREE\b/i,
      'WEAPONS_HOLD': /\bWEAPONS?\s*HOLD\b/i,
      'DEFENSIVE': /\bDEFENSIVE\b/i,
      'RECOMMIT': /\bRECOMMIT\b/i,
      'RESUME': /\bRESUME\b/i,
      'DISREGARD': /\bDISREGARD\b/i,
      'BOGEY_DOPE': /\bBOGEY\s*DOPE\b/i,
      'PICTURE': /\bPICTURE\b/i,
      'ENGAGE': /\bENGAGE\b/i
    };

    for (const [type, pattern] of Object.entries(commandPatterns)) {
      if (pattern.test(text)) {
        return type;
      }
    }

    return null;
  }

  extractHeading(text) {
    // Find a number that looks like a heading (after SNAP/VECTOR keyword)
    const afterCommand = text.replace(/.*(?:SNAP|VECTOR)\s*/i, '');
    const headingMatch = afterCommand.match(/\b(\d{1,3})\b/);
    if (headingMatch) {
      const heading = parseInt(headingMatch[1]);
      if (heading >= 0 && heading <= 360) {
        return heading;
      }
    }

    // Try spoken numbers
    const spoken = this.fuzzyMatchNumber(text);
    if (spoken !== null && spoken >= 0 && spoken <= 360) {
      return spoken;
    }

    return null;
  }

  extractAltitude(text) {
    const match = text.match(/ANGELS?\s*(\d{1,2})/i);
    if (match) {
      return parseInt(match[1]) * 1000; // Angels are in thousands
    }
    return null;
  }

  extractTarget(text) {
    // Try to match known targets first
    for (const target of this.targets) {
      const pattern = new RegExp(target.replace(/[- ]/g, '[- ]?'), 'i');
      if (pattern.test(text)) {
        return target;
      }
    }

    // Try bandit pattern: BANDIT + LETTER
    const banditMatch = text.match(/BANDIT\s*(ALPHA|BRAVO|CHARLIE|DELTA|ECHO|FOXTROT|GOLF|HOTEL|INDIA|JULIET|KILO|LIMA)/i);
    if (banditMatch) {
      return `Bandit ${banditMatch[1].charAt(0).toUpperCase() + banditMatch[1].slice(1).toLowerCase()}`;
    }

    // Try GROUP pattern: GROUP + LETTER (alias for group of bandits)
    const groupMatch = text.match(/GROUP\s*(ALPHA|BRAVO|CHARLIE|DELTA|ECHO|FOXTROT|GOLF|HOTEL)/i);
    if (groupMatch) {
      return `Bandit ${groupMatch[1].charAt(0).toUpperCase() + groupMatch[1].slice(1).toLowerCase()}`;
    }

    return null;
  }

  fuzzyMatchNumber(text) {
    const words = {
      'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
      'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
      'niner': 9
    };

    const matches = text.toLowerCase().match(/\b(zero|one|two|three|four|five|six|seven|eight|nine|niner)\b/g);
    if (matches && matches.length > 0) {
      let result = '';
      for (const word of matches) {
        result += words[word];
      }
      return parseInt(result);
    }

    return null;
  }

  fuzzyMatchCallsign(text) {
    // Future implementation for handling transcription errors
    return null;
  }

  async parseFallback(input) {
    // Future LLM fallback
    return null;
  }

  /**
   * Try to parse input and return partial results for live preview
   * Does not throw errors, returns what could be parsed
   * @param {string} input
   * @returns {Object} { callsign, command, params, unparsed, success }
   */
  tryParse(input) {
    if (!input || !input.trim()) {
      return { callsign: null, command: null, params: {}, unparsed: '', success: false };
    }

    const normalized = input.trim().toUpperCase();

    // Try to extract callsign
    const callsign = this.extractCallsign(normalized);

    // Try to extract command
    const command = this.extractCommand(normalized);

    // Try to extract params
    const params = {};
    if (command === 'SNAP' || command === 'VECTOR') {
      const heading = this.extractHeading(normalized);
      if (heading !== null) {
        params.heading = heading;
      }
    } else if (command === 'ANGELS') {
      const altitude = this.extractAltitude(normalized);
      if (altitude !== null) {
        params.altitude = altitude;
      }
    } else if (command === 'ENGAGE') {
      const target = this.extractTarget(normalized);
      if (target !== null) {
        params.target = target;
      }
    }

    // Determine what wasn't parsed
    let unparsed = normalized;
    if (callsign) {
      unparsed = unparsed.replace(new RegExp(callsign.replace(/[- ]/g, '[- ]?'), 'i'), '').trim();
    }
    if (command) {
      const cmdPattern = command.replace(/_/g, '\\s*');
      unparsed = unparsed.replace(new RegExp(cmdPattern, 'i'), '').trim();
    }
    // Remove parsed params
    for (const val of Object.values(params)) {
      if (typeof val === 'number') {
        unparsed = unparsed.replace(new RegExp(`\\b${val}\\b`), '').trim();
      }
    }

    // Check if we have a valid command
    const success = !!(callsign && command);

    return { callsign, command, params, unparsed, success };
  }
}