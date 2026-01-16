/**
 * Subtitles - On-screen radio message display
 *
 * Shows speaker name and message near the relevant aircraft position.
 * Messages fade after a configurable duration.
 * Center-bottom subtitles are queued vertically (oldest at top).
 */
export class Subtitles {
  constructor(container) {
    this.container = container;
    this.activeSubtitles = [];
    this.duration = 3000;    // ms - how long subtitles stay visible (at 1x speed)

    // ID counter
    this.nextId = 1;

    // Reference to map view for position conversion
    this.mapView = null;

    // Reference to simulation for aircraft lookup and time scale
    this.simulation = null;

    // Vertical spacing for stacked center-bottom subtitles
    this.stackSpacing = 40;

    // Base offset from bottom for center subtitles (above comms log)
    this.baseBottomOffset = 50;

    this.initialized = false;
  }

  /**
   * Initialize subtitles system
   * @param {MapView} mapView - For converting positions
   * @param {Simulation} simulation - For looking up aircraft
   */
  init(mapView = null, simulation = null) {
    if (this.initialized) return;

    this.mapView = mapView;
    this.simulation = simulation;

    // Ensure container is visible and positioned correctly
    this.container.style.display = 'block';

    this.initialized = true;
  }

  /**
   * Show a subtitle
   * @param {string} speaker - Speaker callsign
   * @param {string} message - Message text
   * @param {Object|null} position - Screen position {x, y} or null for auto
   */
  show(speaker, message, position = null) {
    // Get current time scale for duration adjustment
    const timeScale = this.simulation?.timeScale || 1;

    // Adjust duration based on time scale (longer at higher speeds since no voice)
    const adjustedDuration = timeScale > 1 ? this.duration * 1.5 : this.duration;

    const subtitle = {
      id: this.nextId++,
      speaker,
      message,
      position,
      createdAt: Date.now(),
      duration: adjustedDuration,
      element: null,
      isTracked: false,  // Will be true if following an aircraft
      isCenterBottom: false  // Will be true if positioned at center-bottom
    };

    // Create DOM element
    subtitle.element = this.createSubtitleElement(subtitle);
    this.container.appendChild(subtitle.element);

    // Position it
    this.positionSubtitle(subtitle);

    // Start fade animation
    requestAnimationFrame(() => {
      subtitle.element.classList.add('visible');
    });

    this.activeSubtitles.push(subtitle);

    // Reposition all center-bottom subtitles for stacking
    this.repositionCenterBottomSubtitles();

    return subtitle.id;
  }

  /**
   * Create subtitle DOM element
   * @param {Object} subtitle
   * @returns {HTMLElement}
   */
  createSubtitleElement(subtitle) {
    const div = document.createElement('div');
    div.className = 'subtitle';
    div.dataset.id = subtitle.id;

    div.innerHTML = `
      <span class="subtitle-speaker">${subtitle.speaker}:</span>
      <span class="subtitle-message">${subtitle.message}</span>
    `;

    return div;
  }

  /**
   * Position a subtitle on screen
   * @param {Object} subtitle
   */
  positionSubtitle(subtitle) {
    if (subtitle.position) {
      // Use provided position
      subtitle.element.style.left = subtitle.position.x + 'px';
      subtitle.element.style.top = subtitle.position.y + 'px';
      subtitle.isTracked = false;
      subtitle.isCenterBottom = false;
    } else if (this.mapView && this.simulation) {
      // Try to position near the speaker's aircraft
      const pos = this.findSpeakerPosition(subtitle.speaker);
      if (pos) {
        subtitle.element.style.left = pos.x + 'px';
        subtitle.element.style.top = pos.y + 'px';
        subtitle.isTracked = true;
        subtitle.isCenterBottom = false;
      } else {
        // Default to center-bottom of map
        this.positionCenterBottom(subtitle, 0);
        subtitle.isTracked = false;
        subtitle.isCenterBottom = true;
      }
    } else {
      // Default position
      this.positionCenterBottom(subtitle, 0);
      subtitle.isTracked = false;
      subtitle.isCenterBottom = true;
    }
  }

  /**
   * Position subtitle at center-bottom with stack offset
   * @param {Object} subtitle
   * @param {number} stackIndex - Position in stack (0 = bottom/newest)
   */
  positionCenterBottom(subtitle, stackIndex) {
    const containerRect = this.container.getBoundingClientRect();
    subtitle.element.style.left = (containerRect.width / 2) + 'px';
    subtitle.element.style.bottom = (this.baseBottomOffset + stackIndex * this.stackSpacing) + 'px';
    subtitle.element.style.top = 'auto';
    subtitle.element.style.transform = 'translateX(-50%)';
  }

  /**
   * Reposition all center-bottom subtitles for proper stacking
   * Oldest at top, newest at bottom
   */
  repositionCenterBottomSubtitles() {
    const centerBottomSubtitles = this.activeSubtitles.filter(s => s.isCenterBottom);

    // Sort by creation time (oldest first)
    centerBottomSubtitles.sort((a, b) => a.createdAt - b.createdAt);

    // Position from bottom up (newest at bottom = index 0)
    centerBottomSubtitles.forEach((subtitle, index) => {
      // Reverse index so oldest is at top (highest offset)
      const stackIndex = centerBottomSubtitles.length - 1 - index;
      this.positionCenterBottom(subtitle, stackIndex);
    });
  }

  /**
   * Find screen position for a speaker
   * @param {string} speaker - Callsign
   * @returns {Object|null} - {x, y} or null
   */
  findSpeakerPosition(speaker) {
    if (!this.simulation || !this.mapView) return null;

    // Look for flight matching speaker callsign
    let aircraft = null;

    // Check friendly flights
    for (const flight of this.simulation.flights) {
      if (flight.callsign === speaker || speaker.startsWith(flight.callsign)) {
        aircraft = flight.lead || flight.aircraft[0];
        break;
      }
    }

    // Check hostile flights
    if (!aircraft) {
      for (const flight of this.simulation.hostiles) {
        if (flight.callsign === speaker || speaker.startsWith(flight.callsign)) {
          aircraft = flight.lead || flight.aircraft[0];
          break;
        }
      }
    }

    if (!aircraft) return null;

    // Convert aircraft position to screen coordinates
    const geoPos = aircraft.getPosition();
    const screenPos = this.mapView.latLonToScreen(geoPos.lat, geoPos.lon);

    // Offset slightly above and to the right
    return {
      x: screenPos.x + 30,
      y: screenPos.y - 40
    };
  }

  /**
   * Update subtitles (remove expired, update positions)
   * @param {number} delta - Time since last frame in seconds
   */
  update(delta) {
    const now = Date.now();
    let needsReposition = false;

    for (let i = this.activeSubtitles.length - 1; i >= 0; i--) {
      const subtitle = this.activeSubtitles[i];
      const age = now - subtitle.createdAt;

      if (age >= subtitle.duration) {
        // Start fade out
        subtitle.element.classList.remove('visible');
        subtitle.element.classList.add('fading');

        // Remove after fade animation
        setTimeout(() => {
          if (subtitle.element.parentNode) {
            subtitle.element.parentNode.removeChild(subtitle.element);
          }
        }, 300);

        this.activeSubtitles.splice(i, 1);

        if (subtitle.isCenterBottom) {
          needsReposition = true;
        }
      } else if (subtitle.isTracked && this.mapView && this.simulation) {
        // Update position for moving aircraft
        const pos = this.findSpeakerPosition(subtitle.speaker);
        if (pos) {
          subtitle.element.style.left = pos.x + 'px';
          subtitle.element.style.top = pos.y + 'px';
        }
      }
    }

    // Reposition center-bottom stack if any were removed
    if (needsReposition) {
      this.repositionCenterBottomSubtitles();
    }
  }

  /**
   * Render all active subtitles (called each frame)
   */
  render() {
    // Positions are updated in update() if tracking aircraft
  }

  /**
   * Clear all subtitles immediately
   */
  clear() {
    for (const subtitle of this.activeSubtitles) {
      if (subtitle.element.parentNode) {
        subtitle.element.parentNode.removeChild(subtitle.element);
      }
    }
    this.activeSubtitles = [];
  }

  /**
   * Set subtitle duration
   * @param {number} ms - Duration in milliseconds
   */
  setDuration(ms) {
    this.duration = ms;
  }

  /**
   * Show/hide subtitles container
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.container.style.display = visible ? 'block' : 'none';
  }

  /**
   * Get number of active subtitles
   * @returns {number}
   */
  getActiveCount() {
    return this.activeSubtitles.length;
  }

  /**
   * Check if we should skip voice and rely on subtitles only
   * @returns {boolean}
   */
  shouldSkipVoice() {
    const timeScale = this.simulation?.timeScale || 1;
    return timeScale > 1;
  }
}
