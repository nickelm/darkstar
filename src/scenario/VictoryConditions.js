export class VictoryConditions {
  constructor(simulation) {
    this.simulation = simulation;
    this.conditions = null;
    this.state = 'active';   // 'active', 'victory', 'defeat'
  }

  setConditions(config) {}
  
  update(delta) {}
  
  checkVictory() {}
  checkDefeat() {}
  
  // Condition checkers
  checkSurviveTime() {}
  checkProtectPoints() {}
  checkAttritEnemy() {}
  checkLossRatio() {}
  
  getState() {}
  getSummary() {}             // For debrief
}