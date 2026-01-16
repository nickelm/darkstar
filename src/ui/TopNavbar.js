/**
 * Top navigation bar (in-game)
 * Displays game title and settings button
 */
export class TopNavbar {
  constructor(container) {
    this.container = container;

    // Callback for settings button click
    this.onSettingsClick = null;
  }

  init() {
    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="navbar-left">
        <span class="navbar-logo">📡</span>
        <span class="navbar-title">DARKSTAR</span>
      </div>
      <div class="navbar-right">
        <button class="navbar-settings-btn" title="Settings">
          <span class="settings-icon">⚙</span>
        </button>
      </div>
    `;
  }

  bindEvents() {
    const settingsBtn = this.container.querySelector('.navbar-settings-btn');
    settingsBtn.addEventListener('click', () => {
      if (this.onSettingsClick) {
        this.onSettingsClick();
      }
    });
  }

  /**
   * Show the navbar
   */
  show() {
    this.container.classList.remove('hidden');
  }

  /**
   * Hide the navbar
   */
  hide() {
    this.container.classList.add('hidden');
  }
}
