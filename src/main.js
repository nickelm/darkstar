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

// Phase 5a imports
import { settings } from './util/Settings.js';
import { StartScreen } from './ui/StartScreen.js';
import { TopNavbar } from './ui/TopNavbar.js';
import { SettingsModal } from './ui/SettingsModal.js';
import { OutboxPanel } from './ui/OutboxPanel.js';
import { TrackDatabox } from './ui/TrackDatabox.js';

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

    // Phase 5a UI components
    this.settings = settings;  // Use singleton
    this.startScreen = null;
    this.topNavbar = null;
    this.settingsModal = null;
    this.outboxPanel = null;
    this.trackDatabox = null;

    this.lastTimestamp = 0;
    this.running = false;

    // PTT key state
    this.pttKeyDown = false;

    // Background timer for when tab is hidden
    this.backgroundTimer = null;
  }

  async init() {
    // Get DOM containers
    const mapContainer = document.getElementById('map');
    const commandBarContainer = document.getElementById('command-bar');
    const commsLogContainer = document.getElementById('comms-log');
    const subtitlesContainer = document.getElementById('subtitles');
    const startScreenContainer = document.getElementById('start-screen');
    const topNavbarContainer = document.getElementById('top-navbar');
    const settingsModalContainer = document.getElementById('settings-modal');
    const outboxPanelContainer = document.getElementById('outbox-panel');
    const trackDataboxContainer = document.getElementById('track-databoxes');

    // Create audio context (will be resumed on user interaction)
    this.audioContext = createAudioContext();

    // Create simulation
    this.simulation = new Simulation();

    // Apply saved auto-pause settings
    this.applyAutoPauseSettings();

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

    // Phase 5a UI components
    this.startScreen = new StartScreen(startScreenContainer);
    this.topNavbar = new TopNavbar(topNavbarContainer);
    this.settingsModal = new SettingsModal(settingsModalContainer, this.settings);
    this.outboxPanel = new OutboxPanel(outboxPanelContainer, this.outbox);
    this.trackDatabox = new TrackDatabox(trackDataboxContainer, this.mapView);

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

    // Wire up map view to track databox
    this.mapView.setTrackDatabox(this.trackDatabox);

    // Set up global keyboard shortcuts
    this.setupKeyboardShortcuts();

    // Initialize settings modal and wire callbacks
    this.settingsModal.init();
    this.settingsModal.onVoiceInputChange = (enabled) => {
      if (this.voiceInput) {
        this.voiceInput.setEnabled?.(enabled);
      }
    };
    this.settingsModal.onVoiceOutputChange = (enabled, volume) => {
      if (this.voiceOutput) {
        this.voiceOutput.setEnabled?.(enabled);
        this.voiceOutput.setVolume?.(volume);
      }
    };
    this.settingsModal.onAutoPauseChange = (settings) => {
      this.simulation.setAutoPauseSetting('newContact', settings.newContact);
      this.simulation.setAutoPauseSetting('missileLaunch', settings.missileLaunch);
      this.simulation.setAutoPauseSetting('merge', settings.merge);
      this.simulation.setAutoPauseSetting('bingo', settings.bingo);
    };

    // Initialize navbar and wire settings button
    this.topNavbar.init();
    this.topNavbar.onSettingsClick = () => {
      this.settingsModal.show();
    };

    // Initialize start screen and wire callbacks
    this.startScreen.init();
    this.startScreen.onStart((scenarioData) => {
      this.startScenario(scenarioData);
    });
    this.startScreen.onSettingsClick = () => {
      this.settingsModal.show();
    };

    // Initialize outbox panel
    this.outboxPanel.init();

    // Initialize track databox
    this.trackDatabox.init();

    // Show start screen
    this.startScreen.show();
  }

  /**
   * Apply saved auto-pause settings to simulation
   */
  applyAutoPauseSettings() {
    this.simulation.setAutoPauseSetting('newContact', this.settings.get('autoPauseNewContact'));
    this.simulation.setAutoPauseSetting('missileLaunch', this.settings.get('autoPauseMissileLaunch'));
    this.simulation.setAutoPauseSetting('merge', this.settings.get('autoPauseMerge'));
    this.simulation.setAutoPauseSetting('bingo', this.settings.get('autoPauseBingo'));
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

    // Handle visibility change to keep simulation running in background
    document.addEventListener('visibilitychange', () => {
      if (this.running) {
        if (document.hidden) {
          // Tab is hidden - switch to setInterval for background updates
          this.startBackgroundTimer();
        } else {
          // Tab is visible again - switch back to requestAnimationFrame
          this.stopBackgroundTimer();
          this.lastTimestamp = performance.now();
          requestAnimationFrame((ts) => this.gameLoop(ts));
        }
      }
    });
  }

  /**
   * Start background timer for simulation updates when tab is hidden
   */
  startBackgroundTimer() {
    if (this.backgroundTimer) return;

    const targetFPS = 10; // Lower update rate when in background
    const interval = 1000 / targetFPS;

    this.backgroundTimer = setInterval(() => {
      if (!this.running || !document.hidden) return;

      const now = performance.now();
      let delta = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;

      // Cap delta to prevent physics explosion
      delta = Math.min(delta, 0.1);

      // Update simulation only (no rendering needed when hidden)
      this.simulation.update(delta);
      this.outbox.update(delta);
    }, interval);
  }

  /**
   * Stop background timer
   */
  stopBackgroundTimer() {
    if (this.backgroundTimer) {
      clearInterval(this.backgroundTimer);
      this.backgroundTimer = null;
    }
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

    // Hide start screen, show game
    this.startScreen.hide();
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

    // Don't run visual loop when hidden (background timer handles simulation)
    if (document.hidden) return;

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

    // Update command bar (time display)
    this.commandBar.update();

    // Update outbox panel
    this.outboxPanel.update(delta);

    // Update track databoxes
    this.trackDatabox.update();

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

  // Add hostile for testing auto-pause
  addTestHostile() {
    const hostileData = {
      id: 'testBandit',
      callsign: 'Bandit Test',
      type: 'MiG-29',
      count: 2,
      position: { lat: 36.3, lon: -119.8 },
      heading: 180,
      altitude: 20000,
      speed: 400
    };
    const flight = this.simulation.createFlight({ ...hostileData, side: 'red' });
    this.simulation.addHostile(flight);
    for (const aircraft of flight.aircraft) {
      this.mapView.addTrack(aircraft);
    }
    this.commandParser.setTargets(this.simulation.hostiles.map(f => f.callsign));
    console.log('Added test hostile:', flight.callsign);
  }
}

// Initialize app
const app = new Darkstar();
app.init();

// Expose for debugging
window.darkstar = app;
