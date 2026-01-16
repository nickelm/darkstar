import { AIRCRAFT } from '../data/aircraft.js';

/**
 * Track databox panel - shows detailed info for selected/pinned tracks
 * Renders as a panel in the sidebar, not floating overlays
 */
export class TrackDatabox {
  constructor(container, mapView) {
    this.container = container;
    this.mapView = mapView;

    // Pinned tracks: aircraftId -> { aircraft, element }
    this.pinnedTracks = new Map();

    // Currently selected aircraft (shown at top, can be pinned)
    this.selectedAircraft = null;
    this.selectedElement = null;

    // DOM references
    this.header = null;
    this.entriesContainer = null;

    // Expanded state
    this.expanded = true;
  }

  init() {
    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="track-panel-header">
        <span class="track-panel-title">TRACKS</span>
        <button class="track-panel-toggle" title="Toggle panel">▼</button>
      </div>
      <div class="track-panel-entries"></div>
    `;

    this.header = this.container.querySelector('.track-panel-header');
    this.entriesContainer = this.container.querySelector('.track-panel-entries');
  }

  bindEvents() {
    // Toggle expand/collapse
    this.header.addEventListener('click', () => {
      this.toggleExpand();
    });
  }

  /**
   * Select an aircraft (called when clicking on map track)
   * Shows it at top of panel, can be pinned
   * @param {Aircraft} aircraft
   */
  select(aircraft) {
    // If same aircraft, do nothing
    if (this.selectedAircraft?.id === aircraft.id) {
      return;
    }

    // Remove previous selection (if not pinned)
    if (this.selectedAircraft && !this.pinnedTracks.has(this.selectedAircraft.id)) {
      if (this.selectedElement) {
        this.selectedElement.remove();
      }
    }

    this.selectedAircraft = aircraft;

    // If already pinned, just highlight it
    if (this.pinnedTracks.has(aircraft.id)) {
      this.selectedElement = this.pinnedTracks.get(aircraft.id).element;
      this.highlightEntry(aircraft.id);
      return;
    }

    // Create new selection entry at top
    this.selectedElement = this.createDataboxElement(aircraft, false);
    this.entriesContainer.insertBefore(this.selectedElement, this.entriesContainer.firstChild);
    this.bindEntryEvents(aircraft.id, this.selectedElement);
    this.highlightEntry(aircraft.id);
  }

  /**
   * Deselect current aircraft
   */
  deselect() {
    if (this.selectedAircraft && !this.pinnedTracks.has(this.selectedAircraft.id)) {
      if (this.selectedElement) {
        this.selectedElement.remove();
      }
    }
    this.selectedAircraft = null;
    this.selectedElement = null;
  }

  /**
   * Pin an aircraft (add to persistent list)
   * @param {string} aircraftId
   */
  pin(aircraftId) {
    if (this.pinnedTracks.has(aircraftId)) return;

    // If this is the selected aircraft, just mark it pinned
    if (this.selectedAircraft?.id === aircraftId && this.selectedElement) {
      this.pinnedTracks.set(aircraftId, {
        aircraft: this.selectedAircraft,
        element: this.selectedElement
      });
      this.selectedElement.classList.add('pinned');
      this.updatePinButton(this.selectedElement, true);
      return;
    }
  }

  /**
   * Unpin an aircraft (remove from persistent list)
   * @param {string} aircraftId
   */
  unpin(aircraftId) {
    if (!this.pinnedTracks.has(aircraftId)) return;

    const entry = this.pinnedTracks.get(aircraftId);
    this.pinnedTracks.delete(aircraftId);

    // If not currently selected, remove element
    if (this.selectedAircraft?.id !== aircraftId) {
      entry.element.remove();
    } else {
      // Just update visual state
      entry.element.classList.remove('pinned');
      this.updatePinButton(entry.element, false);
    }
  }

  /**
   * Toggle pin state
   * @param {string} aircraftId
   */
  togglePin(aircraftId) {
    if (this.pinnedTracks.has(aircraftId)) {
      this.unpin(aircraftId);
    } else {
      this.pin(aircraftId);
    }
  }

  /**
   * Show databox for an aircraft (legacy API compatibility)
   * @param {Aircraft} aircraft
   * @param {boolean} pinned
   */
  show(aircraft, pinned = false) {
    this.select(aircraft);
    if (pinned) {
      this.pin(aircraft.id);
    }
  }

  /**
   * Hide databox for an aircraft (legacy API compatibility)
   * @param {string} aircraftId
   */
  hide(aircraftId) {
    if (this.selectedAircraft?.id === aircraftId && !this.pinnedTracks.has(aircraftId)) {
      this.deselect();
    }
  }

  /**
   * Highlight a specific entry
   * @param {string} aircraftId
   */
  highlightEntry(aircraftId) {
    // Remove highlight from all
    this.entriesContainer.querySelectorAll('.track-databox').forEach(el => {
      el.classList.remove('selected');
    });

    // Add highlight to specific entry
    const entry = this.entriesContainer.querySelector(`[data-aircraft-id="${aircraftId}"]`);
    if (entry) {
      entry.classList.add('selected');
    }
  }

  /**
   * Create databox element
   * @param {Aircraft} aircraft
   * @param {boolean} pinned
   * @returns {HTMLElement}
   */
  createDataboxElement(aircraft, pinned) {
    const el = document.createElement('div');
    el.className = 'track-databox' + (pinned ? ' pinned' : '');
    el.dataset.aircraftId = aircraft.id;

    const aircraftData = AIRCRAFT[aircraft.type] || {};
    const weapons = this.formatWeapons(aircraftData.weapons);
    const aiState = aircraft.ai?.state || 'unknown';
    const fuelPercent = aircraft.fuel !== undefined ? Math.round(aircraft.fuel) : '??';

    const sideClass = aircraft.side === 'red' ? 'hostile' : 'friendly';

    el.innerHTML = `
      <div class="databox-header ${sideClass}">
        <span class="databox-callsign">${aircraft.callsign}</span>
        <div class="databox-header-actions">
          <button class="databox-pin" title="${pinned ? 'Unpin' : 'Pin'}">
            ${pinned ? '📌' : '📍'}
          </button>
          <button class="databox-close" title="Close">✕</button>
        </div>
      </div>
      <div class="databox-body">
        <div class="databox-row">
          <span class="databox-label">Type</span>
          <span class="databox-value">${aircraft.type}</span>
        </div>
        <div class="databox-row">
          <span class="databox-label">Alt</span>
          <span class="databox-value">${Math.round(aircraft.altitude / 1000)}k ft</span>
        </div>
        <div class="databox-row">
          <span class="databox-label">Speed</span>
          <span class="databox-value">${Math.round(aircraft.speed)} kts</span>
        </div>
        <div class="databox-row">
          <span class="databox-label">Hdg</span>
          <span class="databox-value">${Math.round(aircraft.heading)}°</span>
        </div>
        <div class="databox-row">
          <span class="databox-label">Fuel</span>
          <span class="databox-value ${fuelPercent < 30 ? 'warning' : ''}">${fuelPercent}%</span>
        </div>
        ${weapons ? `
        <div class="databox-row databox-weapons">
          <span class="databox-label">Weapons</span>
          <span class="databox-value">${weapons}</span>
        </div>
        ` : ''}
        <div class="databox-row databox-task">
          <span class="databox-label">Task</span>
          <span class="databox-value databox-state-${aiState.toLowerCase()}">${aiState}</span>
        </div>
      </div>
    `;

    return el;
  }

  /**
   * Bind events to a databox entry
   * @param {string} aircraftId
   * @param {HTMLElement} element
   */
  bindEntryEvents(aircraftId, element) {
    // Close button
    element.querySelector('.databox-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.unpin(aircraftId);
      if (this.selectedAircraft?.id === aircraftId) {
        this.deselect();
      }
    });

    // Pin button
    element.querySelector('.databox-pin').addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePin(aircraftId);
    });
  }

  /**
   * Update pin button appearance
   * @param {HTMLElement} element
   * @param {boolean} pinned
   */
  updatePinButton(element, pinned) {
    const btn = element.querySelector('.databox-pin');
    if (btn) {
      btn.innerHTML = pinned ? '📌' : '📍';
      btn.title = pinned ? 'Unpin' : 'Pin';
    }
  }

  /**
   * Format weapons for display
   * @param {Object} weapons
   * @returns {string}
   */
  formatWeapons(weapons) {
    if (!weapons) return '';

    const parts = [];
    if (weapons.fox3) parts.push(`${weapons.fox3}×AIM-120`);
    if (weapons.fox1) parts.push(`${weapons.fox1}×AIM-7`);
    if (weapons.fox2) parts.push(`${weapons.fox2}×AIM-9`);

    return parts.join(', ');
  }

  /**
   * Update all databox content (called from game loop)
   */
  update() {
    // Update selected entry
    if (this.selectedAircraft && this.selectedElement) {
      this.updateDataboxContent(this.selectedAircraft, this.selectedElement);
    }

    // Update pinned entries
    for (const [id, entry] of this.pinnedTracks) {
      // Skip if this is also the selected (already updated above)
      if (this.selectedAircraft?.id === id) continue;
      this.updateDataboxContent(entry.aircraft, entry.element);
    }
  }

  /**
   * Update databox content for live data
   * @param {Aircraft} aircraft
   * @param {HTMLElement} element
   */
  updateDataboxContent(aircraft, element) {
    const rows = element.querySelectorAll('.databox-row');

    rows.forEach(row => {
      const label = row.querySelector('.databox-label')?.textContent;
      const valueEl = row.querySelector('.databox-value');
      if (!valueEl) return;

      switch (label) {
        case 'Alt':
          valueEl.textContent = `${Math.round(aircraft.altitude / 1000)}k ft`;
          break;
        case 'Speed':
          valueEl.textContent = `${Math.round(aircraft.speed)} kts`;
          break;
        case 'Hdg':
          valueEl.textContent = `${Math.round(aircraft.heading)}°`;
          break;
        case 'Fuel':
          const fuelPercent = aircraft.fuel !== undefined ? Math.round(aircraft.fuel) : '??';
          valueEl.textContent = `${fuelPercent}%`;
          valueEl.classList.toggle('warning', fuelPercent < 30);
          break;
        case 'Task':
          const aiState = aircraft.ai?.state || 'unknown';
          valueEl.textContent = aiState;
          valueEl.className = `databox-value databox-state-${aiState.toLowerCase()}`;
          break;
      }
    });
  }

  /**
   * Toggle expand/collapse
   */
  toggleExpand() {
    this.expanded = !this.expanded;
    this.container.classList.toggle('collapsed', !this.expanded);
    const toggleBtn = this.container.querySelector('.track-panel-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = this.expanded ? '▼' : '▲';
    }
  }

  /**
   * Check if track is pinned (legacy API)
   * @param {string} aircraftId
   * @returns {boolean}
   */
  isPinned(aircraftId) {
    return this.pinnedTracks.has(aircraftId);
  }

  /**
   * Check if track is visible (legacy API)
   * @param {string} aircraftId
   * @returns {boolean}
   */
  isVisible(aircraftId) {
    return this.selectedAircraft?.id === aircraftId || this.pinnedTracks.has(aircraftId);
  }

  /**
   * Get pinned track IDs
   * @returns {string[]}
   */
  getPinnedIds() {
    return Array.from(this.pinnedTracks.keys());
  }

  /**
   * Clear all databoxes
   */
  clear() {
    this.deselect();
    for (const [id] of this.pinnedTracks) {
      this.unpin(id);
    }
  }
}
