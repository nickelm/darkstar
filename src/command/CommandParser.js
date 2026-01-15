import { COMMANDS, Command } from './Commands.js';

export class CommandParser {
  constructor() {
    this.callsigns = [];   // Known callsigns
    this.targets = [];     // Known target designations
  }

  setCallsigns(callsigns) {}
  setTargets(targets) {}
  
  parse(input) {}          // Returns Command[] (handles "break")
  
  parseSegment(segment, currentCallsign) {}
  
  extractCallsign(text) {}
  extractCommand(text) {}
  extractHeading(text) {}
  extractAltitude(text) {}
  extractTarget(text) {}
  
  fuzzyMatchNumber(text) {}   // Handle "two seven zero" → 270
  fuzzyMatchCallsign(text) {} // Handle transcription errors
  
  // Fallback to LLM if available
  async parseFallback(input) {}
}