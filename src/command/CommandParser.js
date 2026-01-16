import { Command } from './Commands.js';

export class CommandParser {
  constructor() {
    // New structured registration system
    this.flightRegistry = new Map();  // normalizedCallsign → FlightRegistration
    this.elementIndex = new Map();    // normalizedElementCallsign → { flightCallsign, elementIndex }
    this.aliasIndex = new Map();      // normalizedAlias → normalizedFlightCallsign

    // Legacy support - kept for backwards compatibility
    this.callsigns = [];
    this.targets = [];

    // Spoken number mappings
    this.spokenNumbers = {
      'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
      'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
      'niner': '9'
    };

    // Common transcription errors (wrong → correct)
    this.commonMistranscriptions = {
      'wiper': 'viper',
      'vipor': 'viper',
      'vyper': 'viper',
      'ego': 'eagle',
      'egal': 'eagle',
      'cobra': 'cobra',
      'copra': 'cobra'
    };
  }

  /**
   * Legacy method - sets simple callsign array
   * @deprecated Use registerFlights instead
   */
  setCallsigns(callsigns) {
    this.callsigns = callsigns;
  }

  setTargets(targets) {
    this.targets = targets;
  }

  /**
   * Register flights with full element and alias support
   * @param {Array} flightsData - Array of { callsign, elements, aliases }
   */
  registerFlights(flightsData) {
    this.flightRegistry.clear();
    this.elementIndex.clear();
    this.aliasIndex.clear();
    this.callsigns = [];

    for (const flightData of flightsData) {
      const registration = this.createFlightRegistration(flightData);
      const normKey = this.normalizeCallsign(flightData.callsign);

      this.flightRegistry.set(normKey, registration);
      this.callsigns.push(flightData.callsign);

      // Index elements
      for (let i = 0; i < registration.elements.length; i++) {
        const elemNorm = this.normalizeCallsign(registration.elements[i]);
        this.elementIndex.set(elemNorm, {
          flightCallsign: flightData.callsign,
          elementCallsign: registration.elements[i],
          elementIndex: i
        });
      }

      // Index aliases
      for (const alias of registration.aliases) {
        const aliasNorm = this.normalizeCallsign(alias);
        this.aliasIndex.set(aliasNorm, normKey);
      }
    }
  }

  /**
   * Create a flight registration object with auto-generated aliases
   */
  createFlightRegistration(flightData) {
    const callsign = flightData.callsign;
    const elements = flightData.elements || [];

    // Auto-generate spoken number aliases
    const autoAliases = this.generateSpokenAliases(callsign, elements);
    const aliases = [...(flightData.aliases || []), ...autoAliases];

    // Parse callsign components (e.g., "Viper 1" → word: "viper", number: "1")
    const match = callsign.match(/^([A-Za-z]+)\s*(\d+)$/);
    const callsignWord = match ? match[1].toLowerCase() : callsign.toLowerCase();
    const callsignNumber = match ? match[2] : '';

    return {
      callsign,
      elements,
      aliases,
      normalizedCallsign: this.normalizeCallsign(callsign),
      callsignWord,
      callsignNumber
    };
  }

  /**
   * Generate spoken number aliases for a flight and its elements
   */
  generateSpokenAliases(callsign, elements) {
    const aliases = [];
    const match = callsign.match(/^([A-Za-z]+)\s*(\d+)$/);
    if (!match) return aliases;

    const word = match[1];
    const num = match[2];

    // "Viper 1" → "viper one"
    const spokenNum = this.numberToSpoken(num);
    aliases.push(`${word} ${spokenNum}`);

    // Add element spoken variants
    for (const element of elements) {
      const elemMatch = element.match(/^([A-Za-z]+)\s*(\d+)-(\d+)$/);
      if (elemMatch) {
        const elemWord = elemMatch[1];
        const flightNum = elemMatch[2];
        const elemNum = elemMatch[3];

        // "Viper 1-1" variants:
        // - "viper one one" (spoken separately)
        // - "viper 11" (run together)
        // - "viper eleven" (as a compound number)
        aliases.push(`${elemWord} ${this.numberToSpoken(flightNum)} ${this.numberToSpoken(elemNum)}`);
        aliases.push(`${elemWord} ${flightNum}${elemNum}`);
        if (flightNum === '1' && elemNum === '1') {
          aliases.push(`${elemWord} eleven`);
        } else if (flightNum === '1' && elemNum === '2') {
          aliases.push(`${elemWord} twelve`);
        }
      }
    }

    return aliases;
  }

  /**
   * Convert a number string to spoken words
   */
  numberToSpoken(num) {
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    return String(num).split('').map(d => words[parseInt(d)] || d).join(' ');
  }

  /**
   * Normalize a callsign for comparison (lowercase, no spaces/dashes)
   */
  normalizeCallsign(callsign) {
    return callsign.toLowerCase().replace(/[- ]/g, '');
  }

  parse(input) {
    const normalized = input.trim().toUpperCase();

    // Split on "BREAK" for multiple commands
    const segments = normalized.split(/\s*,?\s*BREAK\s*,?\s*/);

    const commands = [];
    let currentCallsign = null;
    let currentScope = 'flight';

    for (const segment of segments) {
      const cmd = this.parseSegment(segment, currentCallsign, currentScope);
      if (cmd) {
        if (cmd.ambiguous) {
          // Return ambiguity info for UI to handle
          return [cmd];
        }
        currentCallsign = cmd.callsign;
        currentScope = cmd.scope;
        commands.push(cmd);
      }
    }

    return commands;
  }

  parseSegment(segment, defaultCallsign, defaultScope) {
    if (!segment.trim()) return null;

    // Extract callsign (now returns object with scope)
    const callsignResult = this.extractCallsign(segment);

    // Handle ambiguous callsign
    if (callsignResult?.ambiguous) {
      return {
        ambiguous: true,
        candidates: callsignResult.candidates,
        promptMessage: callsignResult.promptMessage,
        segment
      };
    }

    let callsign = callsignResult?.callsign || defaultCallsign;
    let scope = callsignResult?.scope || defaultScope;

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
    } else if (commandType === 'ENGAGE' || commandType === 'COMMIT') {
      const target = this.extractTarget(segment);
      if (target !== null) {
        params.target = target;
      }
    } else if (commandType === 'OUT') {
      const heading = this.extractHeading(segment);
      if (heading !== null) {
        params.heading = heading;
      }
    } else if (commandType === 'CRANK') {
      const direction = this.extractDirection(segment);
      if (direction !== null) {
        params.direction = direction;
      }
    } else if (commandType === 'HOSTILE' || commandType === 'FRIENDLY') {
      const target = this.extractTarget(segment);
      if (target !== null) {
        params.target = target;
      }
    }

    return new Command(callsign, commandType, params, scope);
  }

  /**
   * Extract and resolve callsign from text
   * Returns { callsign, scope, ... } or { ambiguous: true, ... }
   */
  extractCallsign(text) {
    const normalizedText = text.toLowerCase();

    // 1. Check for broadcast "99" or "ninety-nine"
    if (this.isBroadcast(normalizedText)) {
      return {
        callsign: '99',
        scope: 'broadcast'
      };
    }

    // 2. Convert spoken numbers in text for element matching
    const convertedText = this.convertSpokenNumbers(normalizedText);

    // 3. Try exact element match first (more specific)
    const elementResult = this.tryMatchElement(convertedText);
    if (elementResult) {
      return {
        callsign: elementResult.elementCallsign,
        flightCallsign: elementResult.flightCallsign,
        scope: 'element'
      };
    }

    // 4. Try exact flight match
    const flightResult = this.tryMatchFlight(convertedText);
    if (flightResult) {
      return {
        callsign: flightResult.callsign,
        scope: 'flight'
      };
    }

    // 5. Try alias matching (handles transcription errors and spoken numbers)
    const aliasResult = this.tryMatchAlias(convertedText);
    if (aliasResult) {
      return aliasResult;
    }

    // 6. Try fuzzy matching for transcription errors
    const fuzzyResult = this.fuzzyMatchCallsign(convertedText);
    if (fuzzyResult) {
      return fuzzyResult;
    }

    // 7. Try partial matching (ambiguous - single word like "Viper")
    const partialResult = this.tryPartialMatch(convertedText);
    if (partialResult) {
      return partialResult;
    }

    // 8. Fallback to generic pattern for unknown callsigns
    return this.extractGenericCallsign(text);
  }

  /**
   * Check if text contains a broadcast pattern
   */
  isBroadcast(text) {
    return /\b(99|ninety[\s-]?nine|all\s+(aircraft|flights?))\b/i.test(text);
  }

  /**
   * Convert spoken numbers to digits in text
   */
  convertSpokenNumbers(text) {
    let result = text.toLowerCase();

    // Replace spoken numbers with digits
    for (const [word, digit] of Object.entries(this.spokenNumbers)) {
      result = result.replace(new RegExp(`\\b${word}\\b`, 'gi'), digit);
    }

    // Handle compound spoken numbers
    result = result.replace(/\beleven\b/gi, '11');
    result = result.replace(/\btwelve\b/gi, '12');
    result = result.replace(/\bthirteen\b/gi, '13');
    result = result.replace(/\bfourteen\b/gi, '14');
    result = result.replace(/\bfifteen\b/gi, '15');

    return result;
  }

  /**
   * Try to match an element callsign (e.g., "Viper 1-1")
   */
  tryMatchElement(text) {
    // Pattern for element callsigns
    const patterns = [
      /\b([a-z]+)\s*(\d+)-(\d+)\b/i,        // "Viper 1-1"
      /\b([a-z]+)\s*(\d)[\s](\d)\b/i,       // "Viper 1 1" (space separated)
      /\b([a-z]+)\s*(\d)(\d)\b/i            // "Viper 11" (2 digits run together)
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const word = match[1];
        const flightNum = match[2];
        const elemNum = match[3];

        // Construct the canonical element callsign
        const elementCallsign = `${this.capitalize(word)} ${flightNum}-${elemNum}`;
        const normElem = this.normalizeCallsign(elementCallsign);

        // Check if this element is registered
        if (this.elementIndex.has(normElem)) {
          const info = this.elementIndex.get(normElem);
          return {
            elementCallsign: info.elementCallsign,
            flightCallsign: info.flightCallsign,
            elementIndex: info.elementIndex
          };
        }
      }
    }

    return null;
  }

  /**
   * Try to match a flight callsign (e.g., "Viper 1")
   */
  tryMatchFlight(text) {
    // Try to match known flight callsigns
    for (const [, registration] of this.flightRegistry) {
      // Build flexible pattern that handles spacing
      const pattern = new RegExp(
        registration.callsign.replace(/[- ]/g, '[- ]?'),
        'i'
      );
      if (pattern.test(text)) {
        return { callsign: registration.callsign };
      }
    }

    // Try generic flight pattern: WORD + NUMBER (but not WORD + NUMBER + NUMBER)
    const match = text.match(/\b([a-z]+)\s*(\d+)(?![-\d])\b/i);
    if (match) {
      const word = match[1];
      const num = match[2];
      const candidateCallsign = `${this.capitalize(word)} ${num}`;
      const normCandidate = this.normalizeCallsign(candidateCallsign);

      if (this.flightRegistry.has(normCandidate)) {
        return { callsign: this.flightRegistry.get(normCandidate).callsign };
      }
    }

    return null;
  }

  /**
   * Try to match against registered aliases
   */
  tryMatchAlias(text) {
    const normText = this.normalizeCallsign(text);

    // Check if any alias matches the beginning of the text
    for (const [aliasNorm, flightNormKey] of this.aliasIndex) {
      if (normText.startsWith(aliasNorm) || normText.includes(aliasNorm)) {
        const registration = this.flightRegistry.get(flightNormKey);
        if (registration) {
          // Check if alias refers to element or flight
          // Element aliases contain two consecutive digits
          if (/\d\d/.test(aliasNorm) || /\d\s+\d/.test(aliasNorm)) {
            // This is likely an element alias
            const elemInfo = this.findElementFromAlias(aliasNorm, registration);
            if (elemInfo) {
              return {
                callsign: elemInfo.elementCallsign,
                flightCallsign: registration.callsign,
                scope: 'element'
              };
            }
          }
          return {
            callsign: registration.callsign,
            scope: 'flight'
          };
        }
      }
    }

    return null;
  }

  /**
   * Find element info from an alias
   */
  findElementFromAlias(aliasNorm, registration) {
    // Extract numbers from the alias
    const nums = aliasNorm.match(/\d+/g);
    if (nums && nums.length >= 2) {
      const flightNum = nums[0];
      const elemNum = nums[1];
      const elemCallsign = `${this.capitalize(registration.callsignWord)} ${flightNum}-${elemNum}`;
      const elemNorm = this.normalizeCallsign(elemCallsign);

      if (this.elementIndex.has(elemNorm)) {
        return this.elementIndex.get(elemNorm);
      }
    }
    return null;
  }

  /**
   * Fuzzy match callsign using Levenshtein distance
   */
  fuzzyMatchCallsign(text) {
    // First, try correcting common mistranscriptions
    let correctedText = text;
    for (const [wrong, right] of Object.entries(this.commonMistranscriptions)) {
      if (text.includes(wrong)) {
        correctedText = text.replace(new RegExp(wrong, 'gi'), right);

        // Try element match with corrected text
        const elementResult = this.tryMatchElement(correctedText);
        if (elementResult) {
          return {
            callsign: elementResult.elementCallsign,
            flightCallsign: elementResult.flightCallsign,
            scope: 'element'
          };
        }

        // Try flight match with corrected text
        const flightResult = this.tryMatchFlight(correctedText);
        if (flightResult) {
          return {
            callsign: flightResult.callsign,
            scope: 'flight'
          };
        }
      }
    }

    // Fuzzy match against registered callsigns
    let bestMatch = null;
    let bestScore = 0;
    const THRESHOLD = 0.7;

    // Extract potential callsign from text (first word + number pattern)
    const potentialMatch = text.match(/\b([a-z]+)\s*(\d+(?:-?\d+)?)\b/i);
    if (!potentialMatch) return null;

    const potentialCallsign = this.normalizeCallsign(potentialMatch[0]);

    for (const [, registration] of this.flightRegistry) {
      const score = this.similarityScore(potentialCallsign, registration.normalizedCallsign);
      if (score > bestScore && score >= THRESHOLD) {
        bestScore = score;
        bestMatch = { callsign: registration.callsign, scope: 'flight' };
      }

      // Also check elements
      for (const element of registration.elements) {
        const elemNorm = this.normalizeCallsign(element);
        const elemScore = this.similarityScore(potentialCallsign, elemNorm);
        if (elemScore > bestScore && elemScore >= THRESHOLD) {
          bestScore = elemScore;
          bestMatch = {
            callsign: element,
            flightCallsign: registration.callsign,
            scope: 'element'
          };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Calculate similarity score between two strings (0-1)
   */
  similarityScore(a, b) {
    const distance = this.levenshteinDistance(a, b);
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1 : 1 - (distance / maxLen);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b[i - 1] === a[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Try partial matching for ambiguous single-word callsigns
   */
  tryPartialMatch(text) {
    // Handle single word like "Viper" without number
    const wordMatch = text.match(/^([a-z]+)(?:\s|$)/i);
    if (!wordMatch) return null;

    const word = wordMatch[1].toLowerCase();
    const matches = [];

    for (const registration of this.flightRegistry.values()) {
      if (registration.callsignWord === word) {
        matches.push(registration);
      }
    }

    if (matches.length === 1) {
      // Unambiguous - resolve to the single matching flight
      return { callsign: matches[0].callsign, scope: 'flight' };
    } else if (matches.length > 1) {
      // Ambiguous - return with flag
      return {
        callsign: null,
        scope: 'ambiguous',
        ambiguous: true,
        candidates: matches.map(m => m.callsign),
        promptMessage: `Which ${this.capitalize(word)} flight?`
      };
    }

    return null;
  }

  /**
   * Fallback generic callsign extraction
   */
  extractGenericCallsign(text) {
    // Try generic pattern: WORD + NUMBER (with optional element)
    const match = text.match(/^([A-Z]+)\s*(\d+(?:-\d+)?)/i);
    if (match) {
      const callsign = `${match[1]} ${match[2]}`;
      // Determine scope based on whether it looks like an element
      const scope = match[2].includes('-') || match[2].length > 1 ? 'element' : 'flight';
      return { callsign, scope };
    }
    return null;
  }

  /**
   * Capitalize first letter
   */
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
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
      'ENGAGE': /\bENGAGE\b/i,
      'EXTEND': /\bEXTEND\b/i,
      'PRESS': /\bPRESS\b/i,
      'COMMIT': /\bCOMMIT\b/i,
      'BANZAI': /\bBANZAI\b/i,
      'ABORT': /\bABORT\b/i,
      'OUT': /\bOUT\b/i,
      'CRANK': /\bCRANK\b/i,
      'HOSTILE': /\bHOSTILE\b/i,
      'FRIENDLY': /\bFRIENDLY\b/i,
      'WEAPONS_TIGHT': /\bWEAPONS?\s*TIGHT\b/i
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

  extractDirection(text) {
    // Match left/right direction for CRANK command
    if (/\bLEFT\b/i.test(text)) {
      return 'left';
    }
    if (/\bRIGHT\b/i.test(text)) {
      return 'right';
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

  async parseFallback() {
    // Future LLM fallback
    return null;
  }

  /**
   * Try to parse input and return partial results for live preview
   * Does not throw errors, returns what could be parsed
   * @param {string} input
   * @returns {Object} { callsign, command, params, unparsed, success, scope }
   */
  tryParse(input) {
    if (!input || !input.trim()) {
      return { callsign: null, command: null, params: {}, unparsed: '', success: false, scope: 'flight' };
    }

    const normalized = input.trim().toUpperCase();

    // Try to extract callsign
    const callsignResult = this.extractCallsign(normalized);
    const callsign = callsignResult?.callsign || null;
    const scope = callsignResult?.scope || 'flight';

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

    return { callsign, command, params, unparsed, success, scope };
  }
}
