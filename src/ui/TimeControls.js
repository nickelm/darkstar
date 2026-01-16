/**
 * Time display and speed/pause controls
 * Embeds in CommandBar (left side, before PTT)
 */
export class TimeControls {
  constructor(container, simulation) {
    this.container = container;
    this.simulation = simulation;

    // DOM element references
    this.timeDisplay = null;
    this.speedButtons = {};
    this.pauseButton = null;
    this.pauseReason = null;

    // Callback for when pause state changes
    this.onPauseChange = null;
  }

  init() {
    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="time-controls">
        <div class="time-display">00:00:00</div>
        <div class="speed-buttons">
          <button class="speed-btn active" data-speed="1">1x</button>
          <button class="speed-btn" data-speed="2">2x</button>
          <button class="speed-btn" data-speed="4">4x</button>
        </div>
        <button class="pause-btn" title="Pause (Space)">
          <span class="pause-icon">⏸</span>
        </button>
        <div class="pause-reason hidden"></div>
      </div>
    `;

    // Cache element references
    this.timeDisplay = this.container.querySelector('.time-display');
    this.pauseButton = this.container.querySelector('.pause-btn');
    this.pauseReason = this.container.querySelector('.pause-reason');

    // Cache speed buttons
    this.speedButtons = {};
    this.container.querySelectorAll('.speed-btn').forEach(btn => {
      const speed = parseInt(btn.dataset.speed, 10);
      this.speedButtons[speed] = btn;
    });

    // Listen for auto-pause events
    if (this.simulation.events) {
      this.simulation.events.on('autopause', (data) => {
        this.showPauseReason(data.reason);
        this.updateDisplay();
      });
    }
  }

  bindEvents() {
    // Speed buttons
    for (const [speed, btn] of Object.entries(this.speedButtons)) {
      btn.addEventListener('click', () => {
        this.setSpeed(parseInt(speed, 10));
      });
    }

    // Pause button
    this.pauseButton.addEventListener('click', () => {
      this.togglePause();
    });

    // Keyboard shortcut: Space to pause
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this.isInputFocused()) {
        e.preventDefault();
        this.togglePause();
      }
    });
  }

  /**
   * Check if an input element is focused (to avoid pause while typing)
   */
  isInputFocused() {
    const active = document.activeElement;
    return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  }

  /**
   * Update the time display and button states
   */
  updateDisplay() {
    // Format time as HH:MM:SS
    const totalSeconds = Math.floor(this.simulation.time);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    this.timeDisplay.textContent =
      `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Update speed button states
    const currentSpeed = this.simulation.speed;
    for (const [speed, btn] of Object.entries(this.speedButtons)) {
      btn.classList.toggle('active', parseInt(speed, 10) === currentSpeed);
    }

    // Update pause button state
    const isPaused = this.simulation.paused;
    this.pauseButton.classList.toggle('paused', isPaused);
    this.pauseButton.querySelector('.pause-icon').textContent = isPaused ? '▶' : '⏸';
    this.pauseButton.title = isPaused ? 'Resume (Space)' : 'Pause (Space)';

    // Hide pause reason when resumed
    if (!isPaused) {
      this.hidePauseReason();
    }
  }

  /**
   * Set the game speed
   * @param {number} speed - 1, 2, or 4
   */
  setSpeed(speed) {
    this.simulation.setSpeed(speed);
    this.updateDisplay();
  }

  /**
   * Toggle pause state
   * @returns {boolean} New paused state
   */
  togglePause() {
    const paused = this.simulation.togglePause();
    this.updateDisplay();

    if (this.onPauseChange) {
      this.onPauseChange(paused);
    }

    return paused;
  }

  /**
   * Show auto-pause reason
   * @param {string} reason
   */
  showPauseReason(reason) {
    this.pauseReason.textContent = reason;
    this.pauseReason.classList.remove('hidden');
  }

  /**
   * Hide pause reason
   */
  hidePauseReason() {
    this.pauseReason.classList.add('hidden');
  }

  /**
   * Get current speed
   * @returns {number}
   */
  getSpeed() {
    return this.simulation.speed;
  }

  /**
   * Check if paused
   * @returns {boolean}
   */
  isPaused() {
    return this.simulation.paused;
  }
}
