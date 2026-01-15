import { Simulation } from './simulation/simulation.js';
import { MapView } from './ui/MapView.js';
import { CommandBar } from './ui/CommandBar.js';
import { CommandParser } from './command/CommandParser.js';
import { CommandExecutor } from './command/CommandExecutor.js';
import { Outbox } from './command/Outbox.js';
import { VoiceInput } from './voice/VoiceInput.js';
import { VoiceOutput } from './voice/VoiceOutput.js';
import { CommsLog } from './ui/CommsLog.js';
import { Subtitles } from './ui/Subtitles.js';
import { createAudioContext, resumeAudioContext } from './util/audio.js';

class Darkstar {
  constructor() {
    this.simulation = null;
    this.mapView = null;
    this.commandBar = null;
    this.commandParser = null;
    this.commandExecutor = null;
    this.outbox = null;

    // Voice systems
    this.audioContext = null;
    this.voiceInput = null;
    this.voiceOutput = null;

    // Communications UI
    this.commsLog = null;
    this.subtitles = null;

    this.lastTimestamp = 0;
    this.running = false;

    // PTT key state
    this.pttKeyDown = false;
  }

  async init() {
    // Get DOM containers
    const mapContainer = document.getElementById('map');
    const commandBarContainer = document.getElementById('command-bar');
    const commsLogContainer = document.getElementById('comms-log');
    const subtitlesContainer = document.getElementById('subtitles');

    // Create audio context (will be resumed on user interaction)
    this.audioContext = createAudioContext();

    // Create simulation
    this.simulation = new Simulation();

    // Create voice systems
    this.voiceInput = new VoiceInput();
    this.voiceOutput = new VoiceOutput();

    // Create command system
    this.commandParser = new CommandParser();
    this.commandExecutor = new CommandExecutor(this.simulation, null);
    this.outbox = new Outbox(this.voiceOutput, this.commandExecutor);

    // Create UI components
    this.mapView = new MapView(mapContainer);
    this.commandBar = new CommandBar(commandBarContainer, this.simulation, this.outbox);
    this.commsLog = new CommsLog(commsLogContainer);
    this.subtitles = new Subtitles(subtitlesContainer);

    // Wire up outbox to voice/comms
    this.outbox.voiceOutput = this.voiceOutput;
    this.outbox.commsLog = this.commsLog;
    this.outbox.subtitles = this.subtitles;
    this.outbox.simulation = this.simulation;

    // Wire up voice input to command parser
    this.voiceInput.onResult = (text) => {
      console.log('Voice input:', text);
      const commands = this.commandParser.parse(text);
      for (const cmd of commands) {
        this.outbox.add(cmd, true); // immediate execution for voice
      }
    };

    // Wire up command bar to voice input
    this.commandBar.setVoiceInput(this.voiceInput);

    // Set up global keyboard shortcuts
    this.setupKeyboardShortcuts();

    // For Phase 2, skip start screen and load test scenario directly
    this.startTestScenario();
  }

  setupKeyboardShortcuts() {
    // PTT key (backtick)
    document.addEventListener('keydown', (e) => {
      if (e.key === '`' && !this.pttKeyDown) {
        e.preventDefault();
        this.pttKeyDown = true;
        this.commandBar.startPtt();
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.key === '`') {
        e.preventDefault();
        this.pttKeyDown = false;
        this.commandBar.stopPtt();
      }
    });

    // Resume audio context on any user interaction
    const resumeAudio = async () => {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        await resumeAudioContext(this.audioContext);
      }
    };

    document.addEventListener('click', resumeAudio, { once: true });
    document.addEventListener('keydown', resumeAudio, { once: true });
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

  async startScenario(scenarioData) {
    // Load scenario into simulation
    this.simulation.loadScenario(scenarioData);

    // Update parser with known callsigns and targets
    const callsigns = this.simulation.flights.map(f => f.callsign);
    const targets = this.simulation.hostiles.map(f => f.callsign);
    this.commandParser.setCallsigns(callsigns);
    this.commandParser.setTargets(targets);

    // Initialize voice systems
    this.voiceInput.init();
    await this.voiceOutput.init(this.audioContext);

    // Initialize communications UI
    this.commsLog.init();
    this.commsLog.setAvailableFlights(callsigns);

    // Initialize subtitles with map and simulation references
    this.subtitles.init(this.mapView, this.simulation);

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

    // Update subtitles (remove expired)
    this.subtitles.update(delta);

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

  // Test voice output from console
  testVoice(message = 'Test message, Viper 1-1') {
    if (this.voiceOutput) {
      this.voiceOutput.speakAsPilot('Viper 1-1', message);
    }
  }
}

// Initialize app
const app = new Darkstar();
app.init();

// Expose for debugging
window.darkstar = app;
