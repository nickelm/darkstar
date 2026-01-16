/**
 * Settings modal for configuring game options
 * Voice, auto-pause, difficulty settings
 */
export class SettingsModal {
  constructor(container, settings) {
    this.container = container;
    this.settings = settings;

    this.visible = false;

    // Callbacks for applying settings to external systems
    this.onVoiceInputChange = null;
    this.onVoiceOutputChange = null;
    this.onAutoPauseChange = null;
    this.onDifficultyChange = null;

    // DOM element references
    this.overlay = null;
    this.modal = null;
  }

  init() {
    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="settings-overlay hidden">
        <div class="settings-modal">
          <div class="settings-header">
            <h2>Settings</h2>
            <button class="settings-close" title="Close">✕</button>
          </div>
          <div class="settings-body">

            <div class="settings-section">
              <h3>Voice Input</h3>
              <label class="settings-toggle">
                <input type="checkbox" id="setting-voice-input" checked>
                <span>Enable voice recognition</span>
              </label>
            </div>

            <div class="settings-section">
              <h3>Voice Output</h3>
              <label class="settings-toggle">
                <input type="checkbox" id="setting-voice-output" checked>
                <span>Enable pilot responses</span>
              </label>
              <div class="settings-slider">
                <label for="setting-voice-volume">Volume</label>
                <input type="range" id="setting-voice-volume" min="0" max="100" value="80">
                <span class="slider-value">80%</span>
              </div>
            </div>

            <div class="settings-section">
              <h3>Auto-Pause</h3>
              <p class="settings-hint">Game pauses automatically when these events occur</p>
              <label class="settings-toggle">
                <input type="checkbox" id="setting-autopause-contact" checked>
                <span>New hostile contact detected</span>
              </label>
              <label class="settings-toggle">
                <input type="checkbox" id="setting-autopause-missile" checked>
                <span>Missile launch</span>
              </label>
              <label class="settings-toggle">
                <input type="checkbox" id="setting-autopause-merge" checked>
                <span>Merge (close combat)</span>
              </label>
              <label class="settings-toggle">
                <input type="checkbox" id="setting-autopause-bingo">
                <span>Bingo fuel warning</span>
              </label>
            </div>

            <div class="settings-section">
              <h3>Difficulty</h3>
              <div class="settings-radio-group">
                <label class="settings-radio">
                  <input type="radio" name="difficulty" value="easy">
                  <span>Easy</span>
                  <small>More forgiving, slower enemies</small>
                </label>
                <label class="settings-radio">
                  <input type="radio" name="difficulty" value="normal" checked>
                  <span>Normal</span>
                  <small>Balanced gameplay</small>
                </label>
                <label class="settings-radio">
                  <input type="radio" name="difficulty" value="hard">
                  <span>Hard</span>
                  <small>Aggressive enemies, realistic constraints</small>
                </label>
              </div>
            </div>

          </div>
          <div class="settings-footer">
            <button class="settings-reset">Reset to Defaults</button>
            <div class="settings-actions">
              <button class="settings-cancel">Cancel</button>
              <button class="settings-save">Save</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Cache element references
    this.overlay = this.container.querySelector('.settings-overlay');
    this.modal = this.container.querySelector('.settings-modal');
  }

  bindEvents() {
    // Close button
    this.container.querySelector('.settings-close').addEventListener('click', () => {
      this.hide();
    });

    // Cancel button
    this.container.querySelector('.settings-cancel').addEventListener('click', () => {
      this.hide();
    });

    // Save button
    this.container.querySelector('.settings-save').addEventListener('click', () => {
      this.save();
    });

    // Reset button
    this.container.querySelector('.settings-reset').addEventListener('click', () => {
      this.reset();
    });

    // Click outside modal to close
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.hide();
      }
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.visible) {
        this.hide();
      }
    });

    // Volume slider value display
    const volumeSlider = this.container.querySelector('#setting-voice-volume');
    const volumeValue = this.container.querySelector('.slider-value');
    volumeSlider.addEventListener('input', () => {
      volumeValue.textContent = `${volumeSlider.value}%`;
    });
  }

  /**
   * Show the settings modal
   */
  show() {
    this.loadCurrentSettings();
    this.overlay.classList.remove('hidden');
    this.visible = true;
  }

  /**
   * Hide the settings modal
   */
  hide() {
    this.overlay.classList.add('hidden');
    this.visible = false;
  }

  /**
   * Toggle modal visibility
   */
  toggle() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Load current settings into form
   */
  loadCurrentSettings() {
    const s = this.settings;

    // Voice input
    this.container.querySelector('#setting-voice-input').checked = s.get('voiceInputEnabled');

    // Voice output
    this.container.querySelector('#setting-voice-output').checked = s.get('voiceOutputEnabled');
    const volume = Math.round(s.get('voiceOutputVolume') * 100);
    this.container.querySelector('#setting-voice-volume').value = volume;
    this.container.querySelector('.slider-value').textContent = `${volume}%`;

    // Auto-pause
    this.container.querySelector('#setting-autopause-contact').checked = s.get('autoPauseNewContact');
    this.container.querySelector('#setting-autopause-missile').checked = s.get('autoPauseMissileLaunch');
    this.container.querySelector('#setting-autopause-merge').checked = s.get('autoPauseMerge');
    this.container.querySelector('#setting-autopause-bingo').checked = s.get('autoPauseBingo');

    // Difficulty
    const difficulty = s.get('difficulty');
    const radioBtn = this.container.querySelector(`input[name="difficulty"][value="${difficulty}"]`);
    if (radioBtn) radioBtn.checked = true;
  }

  /**
   * Save settings from form
   */
  save() {
    const s = this.settings;

    // Voice input
    const voiceInputEnabled = this.container.querySelector('#setting-voice-input').checked;
    s.set('voiceInputEnabled', voiceInputEnabled);
    if (this.onVoiceInputChange) {
      this.onVoiceInputChange(voiceInputEnabled);
    }

    // Voice output
    const voiceOutputEnabled = this.container.querySelector('#setting-voice-output').checked;
    const voiceOutputVolume = parseInt(this.container.querySelector('#setting-voice-volume').value, 10) / 100;
    s.set('voiceOutputEnabled', voiceOutputEnabled);
    s.set('voiceOutputVolume', voiceOutputVolume);
    if (this.onVoiceOutputChange) {
      this.onVoiceOutputChange(voiceOutputEnabled, voiceOutputVolume);
    }

    // Auto-pause
    const autoPauseSettings = {
      newContact: this.container.querySelector('#setting-autopause-contact').checked,
      missileLaunch: this.container.querySelector('#setting-autopause-missile').checked,
      merge: this.container.querySelector('#setting-autopause-merge').checked,
      bingo: this.container.querySelector('#setting-autopause-bingo').checked
    };
    s.set('autoPauseNewContact', autoPauseSettings.newContact);
    s.set('autoPauseMissileLaunch', autoPauseSettings.missileLaunch);
    s.set('autoPauseMerge', autoPauseSettings.merge);
    s.set('autoPauseBingo', autoPauseSettings.bingo);
    if (this.onAutoPauseChange) {
      this.onAutoPauseChange(autoPauseSettings);
    }

    // Difficulty
    const difficulty = this.container.querySelector('input[name="difficulty"]:checked')?.value || 'normal';
    s.set('difficulty', difficulty);
    if (this.onDifficultyChange) {
      this.onDifficultyChange(difficulty);
    }

    this.hide();
  }

  /**
   * Reset settings to defaults
   */
  reset() {
    this.settings.reset();
    this.loadCurrentSettings();
  }

  /**
   * Check if modal is visible
   * @returns {boolean}
   */
  isVisible() {
    return this.visible;
  }
}
