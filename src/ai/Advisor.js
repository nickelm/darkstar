export class Advisor {
  constructor(simulation) {
    this.simulation = simulation;
    this.level = 'hints';  // 'off', 'hints', 'suggestions', 'full'
    this.currentHints = [];
  }

  update(delta) {}
  
  checkSituations() {}
  
  // Situation detectors
  checkUncommittedBandits() {}
  checkLaunchRange() {}
  checkInboundMissiles() {}
  checkBingoFuel() {}
  checkUncoveredCAP() {}
  checkLeakers() {}
  
  generateHint(situation) {}
  generateSuggestion(situation) {}
  
  getActiveHints() {}
  dismissHint(hintId) {}
  executeHint(hintId) {}          // "Do it" button
}