import { COMMANDS, Command } from '../command/Commands.js';

export class CommandBar {
  constructor(container, simulation, outbox) {
    this.container = container;
    this.simulation = simulation;
    this.outbox = outbox;

    this.state = 'idle';  // 'idle', 'callsign', 'command', 'param', 'ready'

    this.selectedCallsign = null;
    this.selectedCommand = null;
    this.selectedParams = {};

    this.elements = {};

    // Voice input reference (set by main.js)
    this.voiceInput = null;

    // PTT state
    this.pttState = 'idle';  // 'idle', 'listening', 'processing', 'aborted'
  }

  init() {
    this.render();
    this.bindEvents();
    this.bindScrollIndicators();
  }

  render() {
    this.container.innerHTML = `
      <button class="cmd-ptt" title="Push to Talk (\`)">
        <span class="ptt-icon"></span>
        <span class="ptt-status">PTT</span>
      </button>
      <div class="cmd-slot cmd-callsign" data-slot="callsign">
        <span class="slot-label">Callsign</span>
        <span class="slot-value">-</span>
      </div>
      <div class="cmd-slot cmd-command disabled" data-slot="command">
        <span class="slot-label">Command</span>
        <span class="slot-value">-</span>
      </div>
      <div class="cmd-slot cmd-param disabled" data-slot="param">
        <span class="slot-label">Param</span>
        <span class="slot-value">-</span>
      </div>
      <button class="cmd-send" disabled>SEND</button>
      <button class="cmd-clear">CLEAR</button>
      <div class="cmd-dropdown hidden"></div>
    `;

    // Cache element references
    this.elements.pttBtn = this.container.querySelector('.cmd-ptt');
    this.elements.pttIcon = this.container.querySelector('.ptt-icon');
    this.elements.pttStatus = this.container.querySelector('.ptt-status');
    this.elements.callsignSlot = this.container.querySelector('[data-slot="callsign"]');
    this.elements.commandSlot = this.container.querySelector('[data-slot="command"]');
    this.elements.paramSlot = this.container.querySelector('[data-slot="param"]');
    this.elements.sendBtn = this.container.querySelector('.cmd-send');
    this.elements.clearBtn = this.container.querySelector('.cmd-clear');
    this.elements.dropdown = this.container.querySelector('.cmd-dropdown');
  }

  bindEvents() {
    // PTT button events
    this.bindPttEvents();

    // Callsign slot click
    this.elements.callsignSlot.addEventListener('click', () => {
      this.openCallsignMenu();
    });

    // Command slot click
    this.elements.commandSlot.addEventListener('click', () => {
      if (this.selectedCallsign) {
        this.openCommandMenu();
      }
    });

    // Param slot click (for heading input)
    this.elements.paramSlot.addEventListener('click', () => {
      if (this.selectedCommand && COMMANDS[this.selectedCommand] && COMMANDS[this.selectedCommand].params.length > 0) {
        this.openParamInput();
      }
    });

    // Send button
    this.elements.sendBtn.addEventListener('click', () => {
      this.send();
    });

    // Clear button
    this.elements.clearBtn.addEventListener('click', () => {
      this.clear();
    });

    // Click outside dropdown closes it
    document.addEventListener('click', (e) => {
      if (!this.elements.dropdown.contains(e.target) &&
          !e.target.closest('.cmd-slot')) {
        this.hideDropdown();
      }
    });
  }

  openCallsignMenu(sortByPosition = null) {
    const flights = this.simulation.flights;
    const options = flights.map(f => ({
      value: f.callsign,
      label: f.callsign
    }));

    this.showDropdown(this.elements.callsignSlot, options, (value) => {
      this.selectCallsign(value);
    });
  }

  openCommandMenu() {
    // Phase 3: Show more commands including ENGAGE
    const options = [
      { value: 'SNAP', label: 'SNAP - Immediate turn' },
      { value: 'VECTOR', label: 'VECTOR - Turn to heading' },
      { value: 'ANGELS', label: 'ANGELS - Set altitude' },
      { value: 'BUSTER', label: 'BUSTER - Max cruise' },
      { value: 'GATE', label: 'GATE - Afterburner' },
      { value: 'ENGAGE', label: 'ENGAGE - Attack target' },
      { value: 'RTB', label: 'RTB - Return to base' }
    ];

    this.showDropdown(this.elements.commandSlot, options, (value) => {
      this.selectCommand(value);
    });
  }

  openParamInput(paramType) {
    const command = COMMANDS[this.selectedCommand];
    if (!command || command.params.length === 0) return;

    const param = command.params[0]; // 'heading' for SNAP, 'target' for ENGAGE

    // Handle target selection for ENGAGE
    if (param === 'target') {
      this.openTargetInput();
      return;
    }

    // Create input in dropdown
    let inputHtml = '';
    if (param === 'heading') {
      inputHtml = `
        <div class="heading-quick-row">
          <button class="heading-quick-btn" data-heading="360">N</button>
          <button class="heading-quick-btn" data-heading="90">E</button>
          <button class="heading-quick-btn" data-heading="180">S</button>
          <button class="heading-quick-btn" data-heading="270">W</button>
        </div>
        <div class="param-input">
          <label>Or enter heading (0-360):</label>
          <input type="number" min="0" max="360" step="1" placeholder="045">
          <button class="param-ok">OK</button>
        </div>
      `;
    } else if (param === 'altitude') {
      inputHtml = `
        <div class="param-input">
          <label>Altitude (thousands):</label>
          <input type="number" min="1" max="50" step="1" placeholder="25">
          <button class="param-ok">OK</button>
        </div>
      `;
    }

    this.elements.dropdown.innerHTML = inputHtml;

    // Bind quick heading buttons
    if (param === 'heading') {
      const quickBtns = this.elements.dropdown.querySelectorAll('.heading-quick-btn');
      quickBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const heading = parseInt(btn.dataset.heading);
          this.setParam('heading', heading);
          this.hideDropdown();
        });
      });
    }

    const input = this.elements.dropdown.querySelector('input');
    const okBtn = this.elements.dropdown.querySelector('.param-ok');

    okBtn.addEventListener('click', () => {
      const value = parseInt(input.value);
      if (!isNaN(value)) {
        if (param === 'heading' && value >= 0 && value <= 360) {
          this.setParam('heading', value);
          this.hideDropdown();
        } else if (param === 'altitude' && value >= 1 && value <= 50) {
          this.setParam('altitude', value * 1000);
          this.hideDropdown();
        }
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        okBtn.click();
      }
    });

    this.positionDropdown(this.elements.paramSlot);
    this.elements.dropdown.classList.remove('hidden');
    input.focus();
  }

  openTargetInput() {
    // Get all hostile flights as target options
    const hostiles = this.simulation.hostiles || [];

    if (hostiles.length === 0) {
      // No targets available
      this.elements.dropdown.innerHTML = '<div class="param-input"><label>No hostile contacts</label></div>';
      this.positionDropdown(this.elements.paramSlot);
      this.elements.dropdown.classList.remove('hidden');
      return;
    }

    const options = hostiles.map(f => ({
      value: f.callsign,
      label: `${f.callsign} (${f.aircraft.length}x ${f.lead?.type || 'Unknown'})`
    }));

    this.showDropdown(this.elements.paramSlot, options, (value) => {
      this.setParam('target', value);
    });
  }

  selectCallsign(callsign) {
    this.selectedCallsign = callsign;
    this.elements.callsignSlot.querySelector('.slot-value').textContent = callsign;
    this.state = 'callsign';
    this.hideDropdown();
    this.updateUI();
  }

  selectCommand(command) {
    this.selectedCommand = command;
    this.elements.commandSlot.querySelector('.slot-value').textContent = command;
    this.state = 'command';
    this.hideDropdown();

    // If command has params, prompt for them
    const cmdDef = COMMANDS[command];
    if (cmdDef && cmdDef.params.length > 0) {
      this.openParamInput();
    } else {
      this.state = 'ready';
    }

    this.updateUI();
  }

  setParam(name, value) {
    this.selectedParams[name] = value;
    this.elements.paramSlot.querySelector('.slot-value').textContent = value;
    this.state = 'ready';
    this.updateUI();
  }

  send() {
    if (this.state !== 'ready') return;

    // Create command object
    const command = new Command(
      this.selectedCallsign,
      this.selectedCommand,
      { ...this.selectedParams }
    );

    // Add to outbox (execute immediately for Phase 2)
    this.outbox.add(command, true); // immediate = true

    // Reset state
    this.clear();
  }

  clear() {
    this.selectedCallsign = null;
    this.selectedCommand = null;
    this.selectedParams = {};
    this.state = 'idle';

    this.elements.callsignSlot.querySelector('.slot-value').textContent = '-';
    this.elements.commandSlot.querySelector('.slot-value').textContent = '-';
    this.elements.paramSlot.querySelector('.slot-value').textContent = '-';

    this.hideDropdown();
    this.updateUI();
  }

  updateUI() {
    // Enable/disable slots based on state
    this.elements.commandSlot.classList.toggle('disabled', !this.selectedCallsign);
    this.elements.paramSlot.classList.toggle('disabled', !this.selectedCommand);
    this.elements.sendBtn.disabled = (this.state !== 'ready');
  }

  showDropdown(anchor, options, onSelect) {
    let html = '<ul class="dropdown-list">';
    for (const opt of options) {
      html += `<li data-value="${opt.value}">${opt.label}</li>`;
    }
    html += '</ul>';

    this.elements.dropdown.innerHTML = html;

    // Bind click events
    const items = this.elements.dropdown.querySelectorAll('li');
    items.forEach(item => {
      item.addEventListener('click', () => {
        onSelect(item.dataset.value);
      });
    });

    this.positionDropdown(anchor);
    this.elements.dropdown.classList.remove('hidden');
  }

  positionDropdown(anchor) {
    const rect = anchor.getBoundingClientRect();
    this.elements.dropdown.style.left = rect.left + 'px';
    this.elements.dropdown.style.bottom = (window.innerHeight - rect.top + 5) + 'px';
  }

  hideDropdown() {
    this.elements.dropdown.classList.add('hidden');
  }

  renderCallsignSlot() {
    // Handled in updateUI
  }

  renderCommandSlot() {
    // Handled in updateUI
  }

  renderParamSlot() {
    // Handled in updateUI
  }

  renderSendButton() {
    // Handled in updateUI
  }

  handleKeydown(event) {
    // Future keyboard handling
  }

  /**
   * Set voice input reference and wire up callbacks
   * @param {VoiceInput} voiceInput
   */
  setVoiceInput(voiceInput) {
    this.voiceInput = voiceInput;

    if (this.voiceInput) {
      // Wire up state change callback
      this.voiceInput.onStateChange = (state) => {
        this.setPttState(state);
      };
    }
  }

  /**
   * Start PTT (push to talk)
   */
  startPtt() {
    if (!this.voiceInput) {
      console.warn('Voice input not available');
      return;
    }

    this.voiceInput.start();
  }

  /**
   * Stop PTT (release)
   */
  stopPtt() {
    if (!this.voiceInput) return;
    this.voiceInput.stop();
  }

  /**
   * Set PTT visual state
   * @param {string} state - 'idle', 'listening', 'processing', 'aborted'
   */
  setPttState(state) {
    this.pttState = state;

    const btn = this.elements.pttBtn;
    const status = this.elements.pttStatus;

    if (!btn || !status) return;

    // Remove all state classes
    btn.classList.remove('ptt-idle', 'ptt-listening', 'ptt-processing', 'ptt-aborted');

    // Add current state class
    btn.classList.add(`ptt-${state}`);

    // Update status text
    switch (state) {
      case 'listening':
        status.textContent = 'LISTENING...';
        break;
      case 'processing':
        status.textContent = 'PROCESSING...';
        break;
      case 'aborted':
        status.textContent = 'CANCELLED';
        break;
      default:
        status.textContent = 'PTT';
    }
  }

  /**
   * Bind PTT button events
   */
  bindPttEvents() {
    if (!this.elements.pttBtn) return;

    // Mouse events
    this.elements.pttBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.startPtt();
    });

    this.elements.pttBtn.addEventListener('mouseup', () => {
      this.stopPtt();
    });

    this.elements.pttBtn.addEventListener('mouseleave', () => {
      if (this.pttState === 'listening') {
        this.stopPtt();
      }
    });

    // Touch events for mobile
    this.elements.pttBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.startPtt();
    });

    this.elements.pttBtn.addEventListener('touchend', () => {
      this.stopPtt();
    });
  }

  /**
   * Bind scroll indicators for command bar horizontal scrolling
   */
  bindScrollIndicators() {
    // Create fade indicator elements and append to parent (#game)
    const parent = this.container.parentElement;
    if (!parent) return;

    this.fadeLeft = document.createElement('div');
    this.fadeLeft.className = 'cmd-scroll-fade cmd-scroll-fade-left';
    parent.appendChild(this.fadeLeft);

    this.fadeRight = document.createElement('div');
    this.fadeRight.className = 'cmd-scroll-fade cmd-scroll-fade-right';
    parent.appendChild(this.fadeRight);

    const updateScrollIndicators = () => {
      const container = this.container;
      const scrollLeft = container.scrollLeft;
      const scrollWidth = container.scrollWidth;
      const clientWidth = container.clientWidth;

      // Show left fade if scrolled away from start
      this.fadeLeft.classList.toggle('visible', scrollLeft > 5);

      // Show right fade if more content to scroll
      this.fadeRight.classList.toggle('visible', scrollLeft < scrollWidth - clientWidth - 5);
    };

    // Update on scroll
    this.container.addEventListener('scroll', updateScrollIndicators);

    // Initial check (after a small delay to ensure layout is complete)
    requestAnimationFrame(updateScrollIndicators);

    // Re-check on resize
    window.addEventListener('resize', updateScrollIndicators);
  }
}