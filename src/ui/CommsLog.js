/**
 * CommsLog - Communications log panel
 *
 * Displays radio traffic at the bottom of the screen with:
 * - Collapsed mode: single line showing most recent message
 * - Expanded mode: vertical scroll history growing upward
 */
export class CommsLog {
  constructor(container) {
    this.container = container;
    this.entries = [];
    this.filter = 'all';   // 'all', 'strike', 'guard', or flight callsign
    this.maxEntries = 100;

    // DOM elements
    this.collapsedView = null;
    this.expandedView = null;
    this.logElement = null;
    this.filterElement = null;
    this.latestMessageEl = null;

    // Entry ID counter
    this.nextId = 1;

    // Auto-scroll enabled
    this.autoScroll = true;

    // Available flights (for filter dropdown)
    this.availableFlights = [];

    // Expanded state
    this.isExpanded = false;

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
      <div class="comms-collapsed-view">
        <button class="comms-filter-btn" title="Filter messages">
          <span class="filter-icon">☰</span>
          <span class="filter-label">ALL</span>
        </button>
        <div class="comms-latest-message">
          <span class="latest-text">No messages</span>
        </div>
        <button class="comms-expand-btn" title="Expand comms log">▲</button>
      </div>
      <div class="comms-expanded-view hidden">
        <div class="comms-expanded-header">
          <span class="comms-log-title">COMMUNICATIONS LOG</span>
          <select class="comms-log-filter">
            <option value="all">ALL</option>
            <option value="strike">STRIKE</option>
            <option value="guard">GUARD</option>
          </select>
          <button class="comms-clear-btn" title="Clear log">Clear</button>
          <button class="comms-collapse-btn" title="Collapse">▼</button>
        </div>
        <div class="comms-log-entries"></div>
      </div>
      <div class="comms-filter-dropdown hidden">
        <button class="filter-option" data-filter="all">ALL</button>
        <button class="filter-option" data-filter="strike">STRIKE</button>
        <button class="filter-option" data-filter="guard">GUARD</button>
      </div>
    `;

    // Cache elements
    this.collapsedView = this.container.querySelector('.comms-collapsed-view');
    this.expandedView = this.container.querySelector('.comms-expanded-view');
    this.logElement = this.container.querySelector('.comms-log-entries');
    this.filterElement = this.container.querySelector('.comms-log-filter');
    this.latestMessageEl = this.container.querySelector('.latest-text');
    this.filterBtn = this.container.querySelector('.comms-filter-btn');
    this.filterLabel = this.container.querySelector('.filter-label');
    this.filterDropdown = this.container.querySelector('.comms-filter-dropdown');
    this.expandBtn = this.container.querySelector('.comms-expand-btn');
    this.collapseBtn = this.container.querySelector('.comms-collapse-btn');
    this.clearBtn = this.container.querySelector('.comms-clear-btn');
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Expand button
    this.expandBtn.addEventListener('click', () => {
      this.expand();
    });

    // Collapse button
    this.collapseBtn.addEventListener('click', () => {
      this.collapse();
    });

    // Filter button (collapsed view)
    this.filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFilterDropdown();
    });

    // Filter dropdown options
    this.filterDropdown.querySelectorAll('.filter-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const filter = e.target.dataset.filter;
        this.setFilter(filter);
        this.hideFilterDropdown();
      });
    });

    // Filter select (expanded view)
    this.filterElement.addEventListener('change', (e) => {
      this.setFilter(e.target.value);
    });

    // Clear button
    this.clearBtn.addEventListener('click', () => {
      this.clear();
    });

    // Click outside filter dropdown closes it
    document.addEventListener('click', (e) => {
      if (!this.filterDropdown.contains(e.target) && !this.filterBtn.contains(e.target)) {
        this.hideFilterDropdown();
      }
    });

    // Pause auto-scroll when user scrolls up
    this.logElement.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = this.logElement;
      this.autoScroll = scrollTop + clientHeight >= scrollHeight - 10;
    });

    // Click on collapsed latest message expands
    this.container.querySelector('.comms-latest-message').addEventListener('click', () => {
      this.expand();
    });
  }

  /**
   * Expand the comms log
   */
  expand() {
    this.isExpanded = true;
    this.container.classList.add('expanded');
    this.collapsedView.classList.add('hidden');
    this.expandedView.classList.remove('hidden');
    this.hideFilterDropdown();
    this.scrollToBottom();
  }

  /**
   * Collapse the comms log
   */
  collapse() {
    this.isExpanded = false;
    this.container.classList.remove('expanded');
    this.collapsedView.classList.remove('hidden');
    this.expandedView.classList.add('hidden');
  }

  /**
   * Toggle filter dropdown
   */
  toggleFilterDropdown() {
    this.filterDropdown.classList.toggle('hidden');
  }

  /**
   * Hide filter dropdown
   */
  hideFilterDropdown() {
    this.filterDropdown.classList.add('hidden');
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

    // Rebuild options for expanded view select
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

    // Update collapsed filter dropdown
    let dropdownHtml = `
      <button class="filter-option" data-filter="all">ALL</button>
      <button class="filter-option" data-filter="strike">STRIKE</button>
      <button class="filter-option" data-filter="guard">GUARD</button>
    `;

    for (const flight of this.availableFlights) {
      dropdownHtml += `<button class="filter-option" data-filter="${flight}">${flight}</button>`;
    }

    this.filterDropdown.innerHTML = dropdownHtml;

    // Rebind click events
    this.filterDropdown.querySelectorAll('.filter-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const filter = e.target.dataset.filter;
        this.setFilter(filter);
        this.hideFilterDropdown();
      });
    });
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

    // Update latest message display
    this.updateLatestMessage(logEntry);

    // Render if matches current filter
    if (this.matchesFilter(logEntry)) {
      this.renderEntry(logEntry);
    }
  }

  /**
   * Update the collapsed view's latest message
   * @param {Object} entry
   */
  updateLatestMessage(entry) {
    const timeStr = this.formatTime(entry.time);
    const text = `[${timeStr}] ${entry.speaker}: ${entry.message}`;
    this.latestMessageEl.textContent = text;

    // Add priority class for color coding
    this.latestMessageEl.className = `latest-text priority-${entry.priority}`;
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
    this.filterLabel.textContent = filter.toUpperCase();
    this.filterElement.value = filter;
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
    this.latestMessageEl.textContent = 'No messages';
    this.latestMessageEl.className = 'latest-text';
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
