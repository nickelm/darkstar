/**
 * CommsLog - Communications log panel
 *
 * Displays radio traffic in a scrolling log with timestamps,
 * color coding, and filtering capabilities.
 */
export class CommsLog {
  constructor(container) {
    this.container = container;
    this.entries = [];
    this.filter = 'all';   // 'all', 'strike', 'guard', or flight callsign
    this.maxEntries = 100;

    // DOM elements
    this.logElement = null;
    this.filterElement = null;

    // Entry ID counter
    this.nextId = 1;

    // Auto-scroll enabled
    this.autoScroll = true;

    // Available flights (for filter dropdown)
    this.availableFlights = [];

    this.initialized = false;
  }

  /**
   * Initialize the comms log
   */
  init() {
    if (this.initialized) return;

    this.render();
    this.bindEvents();
    this.initialized = true;
  }

  /**
   * Render the comms log structure
   */
  render() {
    this.container.innerHTML = `
      <div class="comms-log-header">
        <span class="comms-log-title">COMMS</span>
        <select class="comms-log-filter">
          <option value="all">ALL</option>
          <option value="strike">STRIKE</option>
          <option value="guard">GUARD</option>
        </select>
      </div>
      <div class="comms-log-entries"></div>
    `;

    this.logElement = this.container.querySelector('.comms-log-entries');
    this.filterElement = this.container.querySelector('.comms-log-filter');
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    this.filterElement.addEventListener('change', (e) => {
      this.setFilter(e.target.value);
    });

    // Pause auto-scroll when user scrolls up
    this.logElement.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = this.logElement;
      this.autoScroll = scrollTop + clientHeight >= scrollHeight - 10;
    });
  }

  /**
   * Update available flights for filter dropdown
   * @param {string[]} flights - Array of flight callsigns
   */
  setAvailableFlights(flights) {
    this.availableFlights = flights;
    this.updateFilterOptions();
  }

  /**
   * Update filter dropdown options
   */
  updateFilterOptions() {
    // Keep current value
    const currentValue = this.filterElement.value;

    // Rebuild options
    let options = `
      <option value="all">ALL</option>
      <option value="strike">STRIKE</option>
      <option value="guard">GUARD</option>
    `;

    for (const flight of this.availableFlights) {
      options += `<option value="${flight}">${flight}</option>`;
    }

    this.filterElement.innerHTML = options;

    // Restore value if still valid
    if (this.filterElement.querySelector(`option[value="${currentValue}"]`)) {
      this.filterElement.value = currentValue;
    }
  }

  /**
   * Add an entry to the log
   * @param {Object} entry - { channel, speaker, message, priority }
   */
  addEntry(entry) {
    const logEntry = {
      id: this.nextId++,
      time: new Date(),
      channel: entry.channel || 'strike',
      speaker: entry.speaker || 'Unknown',
      message: entry.message || '',
      priority: entry.priority || 'normal',
      callsign: entry.callsign || null  // For filtering by flight
    };

    this.entries.push(logEntry);

    // Trim old entries
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    // Render if matches current filter
    if (this.matchesFilter(logEntry)) {
      this.renderEntry(logEntry);
    }
  }

  /**
   * Check if entry matches current filter
   * @param {Object} entry
   * @returns {boolean}
   */
  matchesFilter(entry) {
    if (this.filter === 'all') return true;
    if (this.filter === entry.channel) return true;
    if (this.filter === entry.speaker) return true;
    if (this.filter === entry.callsign) return true;
    return false;
  }

  /**
   * Set filter and re-render
   * @param {string} filter
   */
  setFilter(filter) {
    this.filter = filter;
    this.renderAllEntries();
  }

  /**
   * Render a single entry
   * @param {Object} entry
   */
  renderEntry(entry) {
    const div = document.createElement('div');
    div.className = `comms-entry priority-${entry.priority}`;
    div.dataset.id = entry.id;

    const timeStr = this.formatTime(entry.time);
    const channelStr = entry.channel.toUpperCase();

    div.innerHTML = `
      <span class="comms-time">${timeStr}</span>
      <span class="comms-channel">[${channelStr}]</span>
      <span class="comms-speaker">${entry.speaker}:</span>
      <span class="comms-message">${entry.message}</span>
    `;

    this.logElement.appendChild(div);

    if (this.autoScroll) {
      this.scrollToBottom();
    }
  }

  /**
   * Render all entries (after filter change)
   */
  renderAllEntries() {
    this.logElement.innerHTML = '';

    for (const entry of this.entries) {
      if (this.matchesFilter(entry)) {
        this.renderEntry(entry);
      }
    }
  }

  /**
   * Format time for display
   * @param {Date} date
   * @returns {string}
   */
  formatTime(date) {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    const s = date.getSeconds().toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  /**
   * Scroll to bottom of log
   */
  scrollToBottom() {
    this.logElement.scrollTop = this.logElement.scrollHeight;
  }

  /**
   * Clear all entries
   */
  clear() {
    this.entries = [];
    this.logElement.innerHTML = '';
  }

  /**
   * Export log for replay/debrief
   * @returns {Object[]}
   */
  exportLog() {
    return this.entries.map(e => ({
      time: e.time.toISOString(),
      channel: e.channel,
      speaker: e.speaker,
      message: e.message,
      priority: e.priority
    }));
  }

  /**
   * Show/hide the comms log
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.container.style.display = visible ? 'flex' : 'none';
  }

  /**
   * Helper to log a GCI (player) command
   * @param {string} targetCallsign
   * @param {string} message
   */
  logGciCommand(targetCallsign, message) {
    this.addEntry({
      channel: 'strike',
      speaker: 'Darkstar',
      message: `${targetCallsign}, ${message}`,
      priority: 'normal',
      callsign: targetCallsign
    });
  }

  /**
   * Helper to log a pilot response
   * @param {string} pilotCallsign
   * @param {string} message
   */
  logPilotResponse(pilotCallsign, message) {
    this.addEntry({
      channel: 'strike',
      speaker: pilotCallsign,
      message: message,
      priority: 'normal',
      callsign: pilotCallsign
    });
  }

  /**
   * Helper to log a warning/threat
   * @param {string} speaker
   * @param {string} message
   */
  logWarning(speaker, message) {
    this.addEntry({
      channel: 'strike',
      speaker: speaker,
      message: message,
      priority: 'warning'
    });
  }

  /**
   * Helper to log a threat call
   * @param {string} speaker
   * @param {string} message
   */
  logThreat(speaker, message) {
    this.addEntry({
      channel: 'guard',
      speaker: speaker,
      message: message,
      priority: 'threat'
    });
  }
}
