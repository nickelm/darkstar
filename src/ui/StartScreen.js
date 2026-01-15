export class StartScreen {
  constructor(container) {
    this.container = container;
    this.scenarios = [];
    this.selectedScenario = null;
    
    this.onStartScenario = null;  // Callback
  }

  init() {}
  
  loadScenarios() {}
  
  render() {}
  renderScenarioList() {}
  renderBriefing(scenario) {}
  renderSettings() {}
  
  selectScenario(scenarioId) {}
  startScenario() {}
  
  show() {}
  hide() {}
}