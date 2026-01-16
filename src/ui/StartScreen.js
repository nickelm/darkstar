/**
 * Landing page with scenario selection and briefing
 */
export class StartScreen {
  constructor(container) {
    this.container = container;
    this.scenarios = [];
    this.selectedScenario = null;

    // Callbacks
    this.onStartCallback = null;
    this.onSettingsClick = null;
  }

  init() {
    this.loadScenarios();
    this.render();
    this.bindEvents();
  }

  /**
   * Load available scenarios
   * For now, hardcoded scenarios - could be loaded from JSON files later
   */
  loadScenarios() {
    this.scenarios = [
      {
        id: 'tutorial',
        name: 'Training Mission',
        description: 'Learn the basics of GCI operations with a simple intercept scenario.',
        difficulty: 'easy',
        year: 2020,  // Modern era - all weapons available
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
        ],
        objectives: [
          'Vector Viper 1 to intercept hostile contacts',
          'Engage and neutralize all bandits'
        ]
      },
      {
        id: 'cap_patrol',
        name: 'CAP Patrol',
        description: 'Defend the airspace with two fighter flights against multiple enemy waves.',
        difficulty: 'normal',
        year: 2020,  // Modern era - all weapons available
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
          },
          {
            id: 'banditBravo',
            callsign: 'Bandit Bravo',
            type: 'Su-27',
            count: 2,
            position: { lat: 35.5, lon: -119.3 },
            heading: 270,
            altitude: 28000,
            speed: 420
          }
        ],
        objectives: [
          'Protect the airspace',
          'Intercept all hostile contacts',
          'Maintain at least one flight operational'
        ]
      },
      {
        id: 'strike_escort',
        name: 'Strike Escort',
        description: 'Coordinate multiple flights to defend against a determined enemy assault.',
        difficulty: 'hard',
        year: 2020,  // Modern era - all weapons available
        bullseye: { lat: 36.0, lon: -120.0 },
        flights: [
          {
            id: 'viper1',
            callsign: 'Viper 1',
            type: 'F-16C',
            count: 4,
            position: { lat: 36.2, lon: -120.5 },
            heading: 90,
            altitude: 25000,
            speed: 350
          },
          {
            id: 'cobra1',
            callsign: 'Cobra 1',
            type: 'F-15C',
            count: 4,
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
            count: 4,
            position: { lat: 36.8, lon: -119.2 },
            heading: 225,
            altitude: 25000,
            speed: 450
          },
          {
            id: 'banditBravo',
            callsign: 'Bandit Bravo',
            type: 'Su-27',
            count: 4,
            position: { lat: 35.2, lon: -119.0 },
            heading: 270,
            altitude: 28000,
            speed: 440
          },
          {
            id: 'banditCharlie',
            callsign: 'Bandit Charlie',
            type: 'MiG-29',
            count: 2,
            position: { lat: 36.0, lon: -118.8 },
            heading: 260,
            altitude: 22000,
            speed: 420
          }
        ],
        objectives: [
          'Survive the enemy assault',
          'Destroy at least 50% of hostile forces',
          'Do not lose more than 4 aircraft'
        ]
      }
    ];
  }

  render() {
    this.container.innerHTML = `
      <div class="start-screen-content">
        <div class="start-header">
          <div class="start-logo">📡</div>
          <h1 class="start-title">DARKSTAR</h1>
          <p class="start-subtitle">GCI/AWACS Tactical Air Combat</p>
        </div>

        <div class="start-main">
          <div class="start-sidebar">
            <h2>Select Mission</h2>
            <div class="scenario-list"></div>
          </div>

          <div class="start-briefing">
            <div class="briefing-placeholder">
              <p>Select a mission to view briefing</p>
            </div>
            <div class="briefing-content hidden">
              <h2 class="briefing-title"></h2>
              <p class="briefing-description"></p>

              <div class="briefing-section">
                <h3>Friendly Forces</h3>
                <ul class="briefing-forces friendly"></ul>
              </div>

              <div class="briefing-section">
                <h3>Hostile Forces</h3>
                <ul class="briefing-forces hostile"></ul>
              </div>

              <div class="briefing-section">
                <h3>Objectives</h3>
                <ul class="briefing-objectives"></ul>
              </div>
            </div>
          </div>
        </div>

        <div class="start-footer">
          <button class="start-settings-btn">
            <span class="settings-icon">&#9881;</span> Settings
          </button>
          <button class="start-btn" disabled>Start Mission</button>
        </div>
      </div>
    `;

    this.renderScenarioList();
  }

  /**
   * Render the scenario list
   */
  renderScenarioList() {
    const listEl = this.container.querySelector('.scenario-list');
    listEl.innerHTML = '';

    for (const scenario of this.scenarios) {
      const item = document.createElement('div');
      item.className = 'scenario-item';
      item.dataset.id = scenario.id;

      const difficultyClass = `difficulty-${scenario.difficulty}`;

      item.innerHTML = `
        <div class="scenario-name">${scenario.name}</div>
        <div class="scenario-meta">
          <span class="scenario-difficulty ${difficultyClass}">${scenario.difficulty}</span>
        </div>
      `;

      listEl.appendChild(item);
    }
  }

  bindEvents() {
    // Scenario selection
    this.container.querySelector('.scenario-list').addEventListener('click', (e) => {
      const item = e.target.closest('.scenario-item');
      if (item) {
        this.selectScenario(item.dataset.id);
      }
    });

    // Start button
    this.container.querySelector('.start-btn').addEventListener('click', () => {
      this.startScenario();
    });

    // Settings button
    this.container.querySelector('.start-settings-btn').addEventListener('click', () => {
      if (this.onSettingsClick) {
        this.onSettingsClick();
      }
    });
  }

  /**
   * Select a scenario by ID
   * @param {string} scenarioId
   */
  selectScenario(scenarioId) {
    const scenario = this.scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    this.selectedScenario = scenario;

    // Update UI selection state
    this.container.querySelectorAll('.scenario-item').forEach(el => {
      el.classList.toggle('selected', el.dataset.id === scenarioId);
    });

    // Enable start button
    this.container.querySelector('.start-btn').disabled = false;

    // Render briefing
    this.renderBriefing(scenario);
  }

  /**
   * Render briefing for selected scenario
   * @param {Object} scenario
   */
  renderBriefing(scenario) {
    const placeholder = this.container.querySelector('.briefing-placeholder');
    const content = this.container.querySelector('.briefing-content');

    placeholder.classList.add('hidden');
    content.classList.remove('hidden');

    // Title and description
    content.querySelector('.briefing-title').textContent = scenario.name;
    content.querySelector('.briefing-description').textContent = scenario.description;

    // Friendly forces
    const friendlyList = content.querySelector('.briefing-forces.friendly');
    friendlyList.innerHTML = '';
    for (const flight of scenario.flights) {
      const li = document.createElement('li');
      li.textContent = `${flight.callsign}: ${flight.count}x ${flight.type}`;
      friendlyList.appendChild(li);
    }

    // Hostile forces
    const hostileList = content.querySelector('.briefing-forces.hostile');
    hostileList.innerHTML = '';
    for (const hostile of scenario.hostiles) {
      const li = document.createElement('li');
      li.textContent = `${hostile.count}x ${hostile.type}`;
      hostileList.appendChild(li);
    }

    // Objectives
    const objectivesList = content.querySelector('.briefing-objectives');
    objectivesList.innerHTML = '';
    if (scenario.objectives) {
      for (const objective of scenario.objectives) {
        const li = document.createElement('li');
        li.textContent = objective;
        objectivesList.appendChild(li);
      }
    }
  }

  /**
   * Start the selected scenario
   */
  startScenario() {
    if (!this.selectedScenario) return;

    if (this.onStartCallback) {
      this.onStartCallback(this.selectedScenario);
    }
  }

  /**
   * Set callback for when a scenario is started
   * @param {Function} callback
   */
  onStart(callback) {
    this.onStartCallback = callback;
  }

  /**
   * Show the start screen
   */
  show() {
    this.container.classList.remove('hidden');
  }

  /**
   * Hide the start screen
   */
  hide() {
    this.container.classList.add('hidden');
  }
}
