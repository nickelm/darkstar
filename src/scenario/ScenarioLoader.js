export class ScenarioLoader {
  constructor(simulation) {
    this.simulation = simulation;
  }

  async load(path) {}              // Load JSON file
  
  parse(scenarioData) {}           // Validate and transform
  
  createFlights(flightConfigs) {}
  createAirbases(airbaseConfigs) {}
  createPatrols(patrolConfigs) {}
  createDefendPoints(pointConfigs) {}
  
  initializeWaves(waveConfigs) {}
}