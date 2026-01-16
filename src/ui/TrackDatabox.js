import { AIRCRAFT } from '../data/aircraft.js';

/**
 * Track databox - floating overlay system with tethers
 *
 * Displays detailed aircraft info as floating overlay elements on the map.
 * Each databox has a tether line connecting it to its track's position.
 * When tracks go off-screen, tethers hide and edge indicators appear.
 */
export class TrackDatabox {
  constructor(container, mapView) {
    this.container = container;
    this.mapView = mapView;

    // Pinned tracks: aircraftId -> { aircraft, element, tetherEl, position, edgeIndicator }
    this.pinnedTracks = new Map();

    // Currently selected aircraft (shown but not pinned)
    this.selectedAircraft = null;
    this.selectedEntry = null;

    // Container for floating databoxes
    this.floatingContainer = null;

    // SVG for tether lines
    this.tetherSvg = null;

    // Container for edge indicators
    this.edgeContainer = null;

    // Default position offset from track
    this.defaultOffset = { x: 60, y: -80 };

    // Map bounds cache (updated each frame)
    this.mapBounds = null;
  }

  init() {
    this.render();
    this.bindEvents();
  }

  render() {
    // Create floating overlay container that covers the map area
    this.container.innerHTML = `
      <svg class="tether-svg"></svg>
      <div class="floating-databoxes"></div>
      <div class="edge-indicators"></div>
    `;

    this.tetherSvg = this.container.querySelector('.tether-svg');
    this.floatingContainer = this.container.querySelector('.floating-databoxes');
    this.edgeContainer = this.container.querySelector('.edge-indicators');
  }

  bindEvents() {
    // Nothing global to bind - events are per-databox
  }

  /**
   * Select an aircraft (called when clicking on map track)
   * @param {Aircraft} aircraft
   */
  select(aircraft) {
    if (this.selectedAircraft?.id === aircraft.id) {
      return;
    }

    // Remove previous selection if not pinned
    if (this.selectedAircraft && !this.pinnedTracks.has(this.selectedAircraft.id)) {
      this.removeEntry(this.selectedEntry);
    }

    this.selectedAircraft = aircraft;

    // If already pinned, just highlight it
    if (this.pinnedTracks.has(aircraft.id)) {
      this.selectedEntry = this.pinnedTracks.get(aircraft.id);
      this.highlightEntry(aircraft.id);
      return;
    }

    // Create new floating databox
    const screenPos = this.getTrackScreenPosition(aircraft);
    const position = {
      x: screenPos.x + this.defaultOffset.x,
      y: screenPos.y + this.defaultOffset.y
    };

    this.selectedEntry = this.createFloatingEntry(aircraft, position, false);
    this.highlightEntry(aircraft.id);
  }

  /**
   * Deselect current aircraft
   */
  deselect() {
    if (this.selectedAircraft && !this.pinnedTracks.has(this.selectedAircraft.id)) {
      this.removeEntry(this.selectedEntry);
    }
    this.selectedAircraft = null;
    this.selectedEntry = null;
  }

  /**
   * Pin an aircraft
   * @param {string} aircraftId
   */
  pin(aircraftId) {
    if (this.pinnedTracks.has(aircraftId)) return;

    // If this is the selected aircraft, mark it as pinned
    if (this.selectedAircraft?.id === aircraftId && this.selectedEntry) {
      this.selectedEntry.pinned = true;
      this.selectedEntry.element.classList.add('pinned');
      this.pinnedTracks.set(aircraftId, this.selectedEntry);
      this.updatePinButton(this.selectedEntry.element, true);
      return;
    }
  }

  /**
   * Unpin an aircraft
   * @param {string} aircraftId
   */
  unpin(aircraftId) {
    if (!this.pinnedTracks.has(aircraftId)) return;

    const entry = this.pinnedTracks.get(aircraftId);
    this.pinnedTracks.delete(aircraftId);

    // If not currently selected, remove entirely
    if (this.selectedAircraft?.id !== aircraftId) {
      this.removeEntry(entry);
    } else {
      // Just update visual state
      entry.pinned = false;
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
   * Create a floating databox entry
   * @param {Aircraft} aircraft
   * @param {Object} position - {x, y} screen position
   * @param {boolean} pinned
   * @returns {Object} Entry object
   */
  createFloatingEntry(aircraft, position, pinned) {
    // Create databox element
    const element = this.createDataboxElement(aircraft, pinned);
    element.style.left = position.x + 'px';
    element.style.top = position.y + 'px';
    this.floatingContainer.appendChild(element);

    // Create tether line
    const tetherEl = this.createTetherElement(aircraft.id);
    this.tetherSvg.appendChild(tetherEl);

    // Create edge indicator (hidden initially)
    const edgeIndicator = this.createEdgeIndicator(aircraft);
    this.edgeContainer.appendChild(edgeIndicator);

    const entry = {
      aircraft,
      element,
      tetherEl,
      edgeIndicator,
      position: { ...position },
      pinned
    };

    // Bind events
    this.bindEntryEvents(aircraft.id, element, entry);

    // Make databox draggable
    this.makeDraggable(element, entry);

    return entry;
  }

  /**
   * Remove an entry completely
   * @param {Object} entry
   */
  removeEntry(entry) {
    if (!entry) return;

    if (entry.element && entry.element.parentNode) {
      entry.element.remove();
    }
    if (entry.tetherEl && entry.tetherEl.parentNode) {
      entry.tetherEl.remove();
    }
    if (entry.edgeIndicator && entry.edgeIndicator.parentNode) {
      entry.edgeIndicator.remove();
    }
  }

  /**
   * Create databox DOM element
   * @param {Aircraft} aircraft
   * @param {boolean} pinned
   * @returns {HTMLElement}
   */
  createDataboxElement(aircraft, pinned) {
    const el = document.createElement('div');
    el.className = 'floating-databox' + (pinned ? ' pinned' : '');
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
   * Create SVG tether line element
   * @param {string} aircraftId
   * @returns {SVGLineElement}
   */
  createTetherElement(aircraftId) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'tether-line');
    line.dataset.aircraftId = aircraftId;
    return line;
  }

  /**
   * Create edge indicator element
   * @param {Aircraft} aircraft
   * @returns {HTMLElement}
   */
  createEdgeIndicator(aircraft) {
    const el = document.createElement('div');
    el.className = 'edge-indicator hidden';
    el.dataset.aircraftId = aircraft.id;

    const sideClass = aircraft.side === 'red' ? 'hostile' : 'friendly';
    el.innerHTML = `
      <span class="edge-arrow ${sideClass}">▶</span>
      <span class="edge-callsign">${aircraft.callsign}</span>
    `;

    return el;
  }

  /**
   * Bind events to databox entry
   * @param {string} aircraftId
   * @param {HTMLElement} element
   * @param {Object} entry
   */
  bindEntryEvents(aircraftId, element, entry) {
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

    // Click on edge indicator to pan map
    entry.edgeIndicator.addEventListener('click', () => {
      this.panToTrack(entry.aircraft);
    });
  }

  /**
   * Make a databox draggable
   * @param {HTMLElement} element
   * @param {Object} entry
   */
  makeDraggable(element, entry) {
    const header = element.querySelector('.databox-header');
    let isDragging = false;
    let startX, startY, startPosX, startPosY;

    const onMouseDown = (e) => {
      if (e.target.closest('.databox-header-actions')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startPosX = entry.position.x;
      startPosY = entry.position.y;
      element.classList.add('dragging');
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      entry.position.x = startPosX + dx;
      entry.position.y = startPosY + dy;
      element.style.left = entry.position.x + 'px';
      element.style.top = entry.position.y + 'px';
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      element.classList.remove('dragging');
    };

    header.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Touch support
    header.addEventListener('touchstart', (e) => {
      if (e.target.closest('.databox-header-actions')) return;
      const touch = e.touches[0];
      isDragging = true;
      startX = touch.clientX;
      startY = touch.clientY;
      startPosX = entry.position.x;
      startPosY = entry.position.y;
      element.classList.add('dragging');
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      entry.position.x = startPosX + dx;
      entry.position.y = startPosY + dy;
      element.style.left = entry.position.x + 'px';
      element.style.top = entry.position.y + 'px';
    }, { passive: true });

    document.addEventListener('touchend', onMouseUp);
  }

  /**
   * Pan map to center on a track
   * @param {Aircraft} aircraft
   */
  panToTrack(aircraft) {
    if (!this.mapView || !this.mapView.map) return;

    const geoPos = aircraft.getPosition();
    this.mapView.map.panTo([geoPos.lat, geoPos.lon]);
  }

  /**
   * Get track screen position
   * @param {Aircraft} aircraft
   * @returns {Object} {x, y}
   */
  getTrackScreenPosition(aircraft) {
    if (!this.mapView) return { x: 100, y: 100 };

    const geoPos = aircraft.getPosition();
    return this.mapView.latLonToScreen(geoPos.lat, geoPos.lon);
  }

  /**
   * Check if a screen position is within visible map area
   * @param {Object} pos - {x, y}
   * @returns {boolean}
   */
  isOnScreen(pos) {
    if (!this.mapBounds) return true;
    const margin = 20;
    return pos.x >= margin &&
           pos.x <= this.mapBounds.width - margin &&
           pos.y >= margin &&
           pos.y <= this.mapBounds.height - margin;
  }

  /**
   * Get edge position for off-screen track
   * @param {Object} trackPos - Track screen position
   * @returns {Object} { x, y, edge, angle }
   */
  getEdgePosition(trackPos) {
    if (!this.mapBounds) return { x: 0, y: 0, edge: 'right', angle: 0 };

    const margin = 25;
    const { width, height } = this.mapBounds;
    const centerX = width / 2;
    const centerY = height / 2;

    // Calculate angle from center to track
    const dx = trackPos.x - centerX;
    const dy = trackPos.y - centerY;
    const angle = Math.atan2(dy, dx);

    // Determine which edge
    let edge, x, y;

    if (Math.abs(dx) > Math.abs(dy) * (width / height)) {
      // Left or right edge
      if (dx > 0) {
        edge = 'right';
        x = width - margin;
      } else {
        edge = 'left';
        x = margin;
      }
      y = centerY + Math.tan(angle) * (x - centerX);
      y = Math.max(margin, Math.min(height - margin, y));
    } else {
      // Top or bottom edge
      if (dy > 0) {
        edge = 'bottom';
        y = height - margin;
      } else {
        edge = 'top';
        y = margin;
      }
      x = centerX + (y - centerY) / Math.tan(angle);
      x = Math.max(margin, Math.min(width - margin, x));
    }

    return { x, y, edge, angle: angle * 180 / Math.PI };
  }

  /**
   * Update tether and edge indicator for an entry
   * @param {Object} entry
   */
  updateEntryTether(entry) {
    const trackPos = this.getTrackScreenPosition(entry.aircraft);
    const databoxPos = entry.position;
    const onScreen = this.isOnScreen(trackPos);

    if (onScreen) {
      // Show tether, hide edge indicator
      entry.tetherEl.classList.remove('hidden');
      entry.edgeIndicator.classList.add('hidden');

      // Update tether line - from databox corner to track
      const databoxRect = entry.element.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();

      // Connect from closest corner of databox to track
      const dbCenterX = databoxPos.x + databoxRect.width / 2;
      const dbCenterY = databoxPos.y + databoxRect.height / 2;

      // Use bottom-left corner of databox
      const tetherStartX = databoxPos.x;
      const tetherStartY = databoxPos.y + databoxRect.height;

      entry.tetherEl.setAttribute('x1', tetherStartX);
      entry.tetherEl.setAttribute('y1', tetherStartY);
      entry.tetherEl.setAttribute('x2', trackPos.x);
      entry.tetherEl.setAttribute('y2', trackPos.y);
    } else {
      // Hide tether, show edge indicator
      entry.tetherEl.classList.add('hidden');
      entry.edgeIndicator.classList.remove('hidden');

      // Position edge indicator
      const edgePos = this.getEdgePosition(trackPos);
      entry.edgeIndicator.style.left = edgePos.x + 'px';
      entry.edgeIndicator.style.top = edgePos.y + 'px';

      // Rotate arrow to point toward track
      const arrow = entry.edgeIndicator.querySelector('.edge-arrow');
      if (arrow) {
        arrow.style.transform = `rotate(${edgePos.angle}deg)`;
      }
    }
  }

  /**
   * Update all databoxes (called from game loop)
   */
  update() {
    // Update map bounds
    if (this.mapView?.map) {
      const container = this.mapView.map.getContainer();
      this.mapBounds = {
        width: container.clientWidth,
        height: container.clientHeight
      };
    }

    // Update selected entry
    if (this.selectedEntry) {
      this.updateDataboxContent(this.selectedEntry.aircraft, this.selectedEntry.element);
      this.updateEntryTether(this.selectedEntry);
    }

    // Update pinned entries
    for (const [id, entry] of this.pinnedTracks) {
      if (this.selectedAircraft?.id === id) continue;
      this.updateDataboxContent(entry.aircraft, entry.element);
      this.updateEntryTether(entry);
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
   * Highlight a specific entry
   * @param {string} aircraftId
   */
  highlightEntry(aircraftId) {
    this.floatingContainer.querySelectorAll('.floating-databox').forEach(el => {
      el.classList.toggle('selected', el.dataset.aircraftId === aircraftId);
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

  // Legacy API compatibility methods

  show(aircraft, pinned = false) {
    this.select(aircraft);
    if (pinned) this.pin(aircraft.id);
  }

  hide(aircraftId) {
    if (this.selectedAircraft?.id === aircraftId && !this.pinnedTracks.has(aircraftId)) {
      this.deselect();
    }
  }

  isPinned(aircraftId) {
    return this.pinnedTracks.has(aircraftId);
  }

  isVisible(aircraftId) {
    return this.selectedAircraft?.id === aircraftId || this.pinnedTracks.has(aircraftId);
  }

  getPinnedIds() {
    return Array.from(this.pinnedTracks.keys());
  }

  clear() {
    this.deselect();
    for (const [id] of this.pinnedTracks) {
      this.unpin(id);
    }
  }
}
