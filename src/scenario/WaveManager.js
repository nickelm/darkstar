export class WaveManager {
  constructor(simulation) {
    this.simulation = simulation;
    this.waves = [];
    this.activeWaveIndex = 0;
  }

  setWaves(waveConfigs) {}
  
  update(delta) {}
  
  spawnWave(wave) {}
  spawnGroup(group) {}
  
  getNextWaveTime() {}
  getRemainingWaves() {}
}