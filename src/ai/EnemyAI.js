export class EnemyAI {
  constructor(aircraft) {
    this.aircraft = aircraft;
    this.aggression = 0.5;        // 0 = defensive, 1 = aggressive
    this.targetFixation = 0.5;    // How long to ignore threats
  }

  update(delta) {}
  
  // State handlers
  handleIngress() {}
  handleEngage() {}
  handleEgress() {}
  handleDefensive() {}
  
  // Decisions
  detectThreat() {}
  shouldEngage(threat) {}
  shouldEvade(threat) {}
  shouldNotch(missile) {}
  
  selectTarget() {}
  getObjective() {}               // Strike target or patrol point
}