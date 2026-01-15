import { Simulation } from './simulation/simulation.js';
import { MapView } from './ui/MapView.js';
import { CommandBar } from './ui/CommandBar.js';
import { CommandParser } from './command/CommandParser.js';
import { CommandExecutor } from './command/CommandExecutor.js';
import { Outbox } from './command/Outbox.js';

class Darkstar {
  constructor() {
    this.simulation = null;
    this.mapView = null;
    this.commandBar = null;
    this.commandParser = null;
    this.commandExecutor = null;
    this.outbox = null;

    this.lastTimestamp = 0;
    this.running = false;
  }

  async init() {
    // Get DOM containers
    const mapContainer = document.getElementById('map');
    const commandBarContainer = document.getElementById('command-bar');

    // Create simulation
    this.simulation = new Simulation();

    // Create command system
    this.commandParser = new CommandParser();
    this.commandExecutor = new CommandExecutor(this.simulation, null);
    this.outbox = new Outbox(null, this.commandExecutor);

    // Create UI components
    this.mapView = new MapView(mapContainer);
    this.commandBar = new CommandBar(commandBarContainer, this.simulation, this.outbox);

    // For Phase 2, skip start screen and load test scenario directly
    this.startTestScenario();
  }

  startTestScenario() {
    // Phase 3 test scenario with multiple flights and hostiles
    const testScenario = {
      name: 'Phase 3 Test',
      bullseye: { lat: 36.0, lon: -120.0 },
      flights: [
        {
          id: 'viper1',
          callsign: 'Viper 1',
          type: 'F-16C',
          count: 2,
          position: { lat: 36.2, lon: -120.5 },
          heading: 90,
          altitude: 25000,
          speed: 350
        },
        {
          id: 'cobra1',
          callsign: 'Cobra 1',
          type: 'F-15C',
          count: 2,
          position: { lat: 35.8, lon: -120.5 },
          heading: 45,
          altitude: 30000,
          speed: 400
        }
      ],
      hostiles: [
        {
          id: 'banditAlpha',
          callsign: 'Bandit Alpha',
          type: 'MiG-29',
          count: 2,
          position: { lat: 36.5, lon: -119.5 },
          heading: 225,
          altitude: 25000,
          speed: 400
        }
      ]
    };

    this.startScenario(testScenario);
  }

  startScenario(scenarioData) {
    // Load scenario into simulation
    this.simulation.loadScenario(scenarioData);

    // Update parser with known callsigns and targets
    const callsigns = this.simulation.flights.map(f => f.callsign);
    const targets = this.simulation.hostiles.map(f => f.callsign);
    this.commandParser.setCallsigns(callsigns);
    this.commandParser.setTargets(targets);

    // Initialize map view
    this.mapView.init(scenarioData.bullseye, 8);
    this.mapView.setScenario(scenarioData);

    // Add all friendly aircraft to map
    for (const flight of this.simulation.flights) {
      for (const aircraft of flight.aircraft) {
        this.mapView.addTrack(aircraft);
      }
    }

    // Add all hostile aircraft to map
    for (const flight of this.simulation.hostiles) {
      for (const aircraft of flight.aircraft) {
        this.mapView.addTrack(aircraft);
      }
    }

    // Wire up track selection to command bar
    // Clicking friendly: select callsign
    // Clicking hostile when ENGAGE selected: select target
    this.mapView.onTrackClick = (aircraft) => {
      if (aircraft.side === 'red' && this.commandBar.selectedCommand === 'ENGAGE') {
        // Fill target slot with clicked hostile's flight callsign
        if (aircraft.flight) {
          this.commandBar.setParam('target', aircraft.flight.callsign);
        }
      } else if (aircraft.flight) {
        // Select friendly flight
        this.commandBar.selectCallsign(aircraft.flight.callsign);
      }
    };

    // Initialize command bar
    this.commandBar.init();

    // Show game, hide start screen
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game').classList.remove('hidden');

    // Force Leaflet to recalculate container size after showing
    setTimeout(() => {
      this.mapView.map.invalidateSize();
    }, 100);

    // Start game loop
    this.running = true;
    this.lastTimestamp = performance.now();
    requestAnimationFrame((ts) => this.gameLoop(ts));
  }

  gameLoop(timestamp) {
    if (!this.running) return;

    // Calculate delta time in seconds
    let delta = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    // Cap delta to prevent physics explosion
    delta = Math.min(delta, 0.1);

    // Update simulation
    this.simulation.update(delta);

    // Update outbox (processes pending commands)
    this.outbox.update(delta);

    // Render map
    this.mapView.render();

    // Schedule next frame
    requestAnimationFrame((ts) => this.gameLoop(ts));
  }

  // Public method for debugging from console
  sendCommand(text) {
    const commands = this.commandParser.parse(text);
    for (const cmd of commands) {
      this.commandExecutor.execute(cmd);
    }
  }
}

// Initialize app
const app = new Darkstar();
app.init();

// Expose for debugging
window.darkstar = app;