/**
 * Subtitles - On-screen radio message display
 *
 * Shows speaker name and message near the relevant aircraft position.
 * Messages fade after a configurable duration.
 */
export class Subtitles {
  constructor(container) {
    this.container = container;
    this.activeSubtitles = [];
    this.duration = 3000;    // ms - how long subtitles stay visible

    // ID counter
    this.nextId = 1;

    // Reference to map view for position conversion
    this.mapView = null;

    // Reference to simulation for aircraft lookup
    this.simulation = null;

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
   * @param {Object|null} position - Screen position {x, y} or null for default
   */
  show(speaker, message, position = null) {
    const subtitle = {
      id: this.nextId++,
      speaker,
      message,
      position,
      createdAt: Date.now(),
      element: null
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
    } else if (this.mapView && this.simulation) {
      // Try to position near the speaker's aircraft
      const pos = this.findSpeakerPosition(subtitle.speaker);
      if (pos) {
        subtitle.element.style.left = pos.x + 'px';
        subtitle.element.style.top = pos.y + 'px';
      } else {
        // Default to center-bottom of map
        this.positionDefault(subtitle);
      }
    } else {
      // Default position
      this.positionDefault(subtitle);
    }
  }

  /**
   * Position subtitle at default location (center-bottom)
   * @param {Object} subtitle
   */
  positionDefault(subtitle) {
    const containerRect = this.container.parentElement.getBoundingClientRect();
    subtitle.element.style.left = (containerRect.width / 2) + 'px';
    subtitle.element.style.bottom = '100px';
    subtitle.element.style.top = 'auto';
    subtitle.element.style.transform = 'translateX(-50%)';
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
   * Update subtitles (remove expired)
   * @param {number} delta - Time since last frame in seconds
   */
  update(delta) {
    const now = Date.now();

    for (let i = this.activeSubtitles.length - 1; i >= 0; i--) {
      const subtitle = this.activeSubtitles[i];
      const age = now - subtitle.createdAt;

      if (age >= this.duration) {
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
      } else if (subtitle.position === null && this.mapView && this.simulation) {
        // Update position for moving aircraft
        const pos = this.findSpeakerPosition(subtitle.speaker);
        if (pos) {
          subtitle.element.style.left = pos.x + 'px';
          subtitle.element.style.top = pos.y + 'px';
        }
      }
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
}
