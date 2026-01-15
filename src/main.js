import { Simulation } from './simulation/Simulation.js';
import { MapView } from './ui/MapView.js';
import { CommandBar } from './ui/CommandBar.js';
import { VoiceInput } from './voice/VoiceInput.js';
import { VoiceOutput } from './voice/VoiceOutput.js';
import { StartScreen } from './ui/StartScreen.js';

class Darkstar {
  constructor() {
    this.simulation = null;
    this.mapView = null;
    this.commandBar = null;
    this.voiceInput = null;
    this.voiceOutput = null;
  }

  async init() {}
  
  startScenario(scenarioData) {}
  
  gameLoop(timestamp) {}
}

const app = new Darkstar();
app.init();