import L from 'leaflet';

export class MapView {
  constructor(container) {
    this.container = container;
    this.map = null;              // Leaflet map
    this.canvasEl = null;         // Canvas overlay
    this.ctx = null;

    this.tracks = new Map();      // id -> track display object
    this.selectedTrack = null;
    this.pinnedTracks = [];

    this.bullseye = null;
    this.rangeRings = [];

    // Callbacks
    this.onTrackClickCallback = null;
    this.onTrackHoverCallback = null;

    // Track databox reference (set by main.js)
    this.trackDatabox = null;

    // Hover state
    this.hoveredTrackId = null;

    // Combat system reference (set by main.js)
    this.simulation = null;
  }

  init(center, zoom) {
    // Initialize Leaflet map with touch support
    this.map = L.map(this.container, {
      center: [center.lat, center.lon],
      zoom: zoom || 8,
      zoomControl: true,
      tap: true,
      touchZoom: true,
      dragging: true
    });

    // Add dark tile layer (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(this.map);

    // Create canvas overlay for tracks
    this.createCanvasOverlay();

    // Handle map events
    this.map.on('moveend', () => this.render());
    this.map.on('zoomend', () => this.render());
  }

  createCanvasOverlay() {
    // Create canvas manually and append to overlay pane
    this.canvasEl = document.createElement('canvas');
    this.canvasEl.className = 'track-canvas';
    this.canvasEl.style.position = 'absolute';
    this.canvasEl.style.top = '0';
    this.canvasEl.style.left = '0';
    this.canvasEl.style.pointerEvents = 'none'; // Let touches pass through to Leaflet
    this.canvasEl.style.zIndex = '400'; // Above tiles, below controls

    this.map.getPane('overlayPane').appendChild(this.canvasEl);
    this.ctx = this.canvasEl.getContext('2d');

    this.resizeCanvas();

    this.map.on('move', () => {
      this.updateCanvasPosition();
      this.render();
    });
    this.map.on('resize', () => {
      this.resizeCanvas();
      this.render();
    });

    // Handle clicks on map for track selection (hit-testing)
    this.map.on('click', (e) => this.handleMapClick(e));

    // Handle mouse move for hover detection
    this.map.on('mousemove', (e) => this.handleMapHover(e));

    // Handle mouse leave to clear hover
    this.container.addEventListener('mouseleave', () => this.clearHover());
  }

  resizeCanvas() {
    const size = this.map.getSize();
    this.canvasEl.width = size.x;
    this.canvasEl.height = size.y;
  }

  updateCanvasPosition() {
    const topLeft = this.map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this.canvasEl, topLeft);
  }

  setScenario(scenarioData) {
    this.bullseye = scenarioData.bullseye;
  }

  addTrack(aircraft) {
    this.tracks.set(aircraft.id, {
      aircraft: aircraft,
      selected: false
    });
  }

  removeTrack(aircraftId) {
    this.tracks.delete(aircraftId);
  }

  updateTrack(aircraft) {
    // Track data is live reference, just trigger re-render
  }

  updateAllTracks() {
    // Tracks are live references, render updates automatically
  }

  selectTrack(aircraftId) {
    // Deselect previous
    for (const [id, trackData] of this.tracks) {
      trackData.selected = false;
    }

    // Select new
    if (aircraftId && this.tracks.has(aircraftId)) {
      this.tracks.get(aircraftId).selected = true;
      this.selectedTrack = aircraftId;
    } else {
      this.selectedTrack = null;
    }

    this.render();
  }

  pinTrack(aircraftId) {
    if (!this.pinnedTracks.includes(aircraftId)) {
      this.pinnedTracks.push(aircraftId);
    }
  }

  unpinTrack(aircraftId) {
    const index = this.pinnedTracks.indexOf(aircraftId);
    if (index !== -1) {
      this.pinnedTracks.splice(index, 1);
    }
  }

  render() {
    if (!this.ctx) return;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);

    // Draw bullseye
    if (this.bullseye) {
      this.drawBullseye(this.bullseye.lat, this.bullseye.lon);
    }

    // Draw all tracks (skip aircraft in merges - they're abstracted)
    const mergedAircraft = this.getMergedAircraftIds();
    for (const [id, trackData] of this.tracks) {
      // Skip dead aircraft
      if (!trackData.aircraft.isAlive()) continue;
      // Skip aircraft in merges (they're shown as furball icon)
      if (mergedAircraft.has(trackData.aircraft.id)) continue;
      this.drawTrack(trackData.aircraft, trackData.selected);
    }

    // Draw missiles
    if (this.simulation && this.simulation.combat) {
      for (const missile of this.simulation.combat.activeMissiles) {
        this.drawMissile(missile);
      }

      // Draw merges (furball icons)
      for (const merge of this.simulation.combat.activeMerges) {
        this.drawMerge(merge);
      }
    }
  }

  /**
   * Get IDs of all aircraft currently in merges
   * @returns {Set<string>}
   */
  getMergedAircraftIds() {
    const ids = new Set();
    if (this.simulation && this.simulation.combat) {
      for (const merge of this.simulation.combat.activeMerges) {
        for (const ac of merge.getAllParticipants()) {
          ids.add(ac.id);
        }
      }
    }
    return ids;
  }

  drawBullseye(lat, lon) {
    const point = this.map.latLngToContainerPoint([lat, lon]);
    const ctx = this.ctx;

    ctx.save();
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;

    // Draw concentric rings
    const ringRadii = [20, 40, 60];
    for (const r of ringRadii) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw crosshairs
    ctx.beginPath();
    ctx.moveTo(point.x - 70, point.y);
    ctx.lineTo(point.x + 70, point.y);
    ctx.moveTo(point.x, point.y - 70);
    ctx.lineTo(point.x, point.y + 70);
    ctx.stroke();

    ctx.restore();
  }

  drawTrack(aircraft, isSelected) {
    const pos = aircraft.getPosition();
    const point = this.map.latLngToContainerPoint([pos.lat, pos.lon]);
    const ctx = this.ctx;

    ctx.save();

    // Determine color based on side
    const color = aircraft.side === 'blue' ? '#00BFFF' : '#FF4444';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    if (isSelected) {
      ctx.lineWidth = 3;
    } else {
      ctx.lineWidth = 2;
    }

    // Draw symbol based on side (wedge for friendly, diamond for hostile)
    if (aircraft.side === 'red') {
      this.drawNATOHostileSymbol(ctx, point.x, point.y, aircraft.heading, color);
    } else {
      this.drawNATOFighterSymbol(ctx, point.x, point.y, aircraft.heading, color);
    }

    // Draw velocity vector (heading line)
    const vecLength = 30;
    const headingRad = aircraft.heading * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(
      point.x + vecLength * Math.sin(headingRad),
      point.y - vecLength * Math.cos(headingRad)
    );
    ctx.stroke();

    // Draw data block
    this.drawDataBlock(ctx, point.x, point.y, aircraft);

    ctx.restore();
  }

  drawNATOFighterSymbol(ctx, x, y, heading, color) {
    // Simple fighter symbol: pointed wedge
    const size = 12;
    const headingRad = heading * Math.PI / 180;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(headingRad);

    ctx.beginPath();
    ctx.moveTo(0, -size);           // Nose
    ctx.lineTo(size * 0.7, size);   // Right wing
    ctx.lineTo(0, size * 0.5);      // Tail notch
    ctx.lineTo(-size * 0.7, size);  // Left wing
    ctx.closePath();

    ctx.stroke();
    ctx.fillStyle = color + '40';   // Semi-transparent fill
    ctx.fill();

    ctx.restore();
  }

  drawNATOHostileSymbol(ctx, x, y, heading, color) {
    // Diamond shape for hostile aircraft
    const size = 12;
    const headingRad = heading * Math.PI / 180;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(headingRad);

    ctx.beginPath();
    ctx.moveTo(0, -size);       // Top (nose)
    ctx.lineTo(size, 0);        // Right
    ctx.lineTo(0, size);        // Bottom
    ctx.lineTo(-size, 0);       // Left
    ctx.closePath();

    ctx.stroke();
    ctx.fillStyle = color + '40';   // Semi-transparent fill
    ctx.fill();

    ctx.restore();
  }

  drawDataBlock(ctx, x, y, aircraft) {
    // Data block offset to upper right
    const offsetX = 15;
    const offsetY = -15;
    const blockX = x + offsetX;
    const blockY = y + offsetY;

    ctx.font = '11px monospace';
    const color = aircraft.side === 'blue' ? '#00BFFF' : '#FF4444';

    // Prepare text lines
    const line1 = aircraft.callsign;
    const angels = Math.round(aircraft.altitude / 1000);
    const line2 = `${aircraft.type} A${angels}`;
    const line3 = `${Math.round(aircraft.speed)}kt ${Math.round(aircraft.heading).toString().padStart(3, '0')}`;

    // Measure text to calculate box size
    const lineHeight = 12;
    const padding = 4;
    const textWidth = Math.max(
      ctx.measureText(line1).width,
      ctx.measureText(line2).width,
      ctx.measureText(line3).width
    );
    const boxWidth = textWidth + padding * 2;
    const boxHeight = lineHeight * 3 + padding * 2;

    // Draw background box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(blockX - padding, blockY - lineHeight - padding + 2, boxWidth, boxHeight);

    // Draw subtle border
    ctx.strokeStyle = color + '60'; // Semi-transparent version of track color
    ctx.lineWidth = 1;
    ctx.strokeRect(blockX - padding, blockY - lineHeight - padding + 2, boxWidth, boxHeight);

    // Draw text
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(line1, blockX, blockY);
    ctx.fillText(line2, blockX, blockY + lineHeight);
    ctx.fillText(line3, blockX, blockY + lineHeight * 2);
  }

  drawRangeRings(center, rings) {
    // Future implementation
  }

  drawMissile(missile) {
    if (!missile || missile.isDead()) return;

    // Get missile position in geo coordinates
    const geoPos = this.simulation.geoRef.toGeo(missile.position.x, missile.position.y);
    const point = this.map.latLngToContainerPoint([geoPos.lat, geoPos.lon]);
    const ctx = this.ctx;

    ctx.save();

    // Color based on shooter side
    const color = missile.shooter?.side === 'blue' ? '#00FF00' : '#FF8800';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    // Draw missile as small triangle pointing in direction of travel
    const size = 6;
    const headingRad = missile.heading * Math.PI / 180;

    ctx.translate(point.x, point.y);
    ctx.rotate(headingRad);

    ctx.beginPath();
    ctx.moveTo(0, -size);           // Nose
    ctx.lineTo(size * 0.5, size);   // Right
    ctx.lineTo(-size * 0.5, size);  // Left
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Draw trail (velocity vector showing direction)
    ctx.save();
    ctx.strokeStyle = color + '80'; // Semi-transparent
    ctx.lineWidth = 1;
    const trailLength = 20;

    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(
      point.x - trailLength * Math.sin(headingRad),
      point.y + trailLength * Math.cos(headingRad)
    );
    ctx.stroke();
    ctx.restore();

    // Draw state indicator for active/terminal missiles
    if (missile.state === 'active' || missile.state === 'terminal') {
      ctx.save();
      ctx.strokeStyle = missile.state === 'terminal' ? '#FF0000' : '#FFFF00';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawMerge(merge) {
    if (!merge || merge.state === 'resolved') return;

    // Get merge centroid position
    const geoPos = this.simulation.geoRef.toGeo(merge.position.x, merge.position.y);
    const point = this.map.latLngToContainerPoint([geoPos.lat, geoPos.lon]);
    const ctx = this.ctx;

    ctx.save();

    // Draw furball icon - overlapping circles representing chaos
    const size = 20;

    // Outer pulsing ring (yellow/orange for danger)
    ctx.strokeStyle = '#FFA500';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
    ctx.stroke();

    // Inner crossed swords / chaos pattern
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;

    // Draw X pattern
    ctx.beginPath();
    ctx.moveTo(point.x - size * 0.6, point.y - size * 0.6);
    ctx.lineTo(point.x + size * 0.6, point.y + size * 0.6);
    ctx.moveTo(point.x + size * 0.6, point.y - size * 0.6);
    ctx.lineTo(point.x - size * 0.6, point.y + size * 0.6);
    ctx.stroke();

    // Draw small dots for participants
    const blueCount = merge.participants.blue.length;
    const redCount = merge.participants.red.length;

    // Blue dots on left
    ctx.fillStyle = '#00BFFF';
    for (let i = 0; i < blueCount; i++) {
      ctx.beginPath();
      ctx.arc(point.x - size - 5, point.y - 8 + i * 10, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Red dots on right
    ctx.fillStyle = '#FF4444';
    for (let i = 0; i < redCount; i++) {
      ctx.beginPath();
      ctx.arc(point.x + size + 5, point.y - 8 + i * 10, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Label
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MERGE', point.x, point.y + size + 12);

    ctx.restore();
  }

  drawAirbase(airbase) {
    // Future implementation
  }

  drawPatrolPattern(pattern) {
    // Future implementation
  }

  handleMapClick(event) {
    // Get click position in container coordinates
    const clickPoint = this.map.latLngToContainerPoint(event.latlng);
    const clickX = clickPoint.x;
    const clickY = clickPoint.y;

    // Find if click is near any track (hit-testing)
    for (const [id, trackData] of this.tracks) {
      const pos = trackData.aircraft.getPosition();
      const point = this.map.latLngToContainerPoint([pos.lat, pos.lon]);

      const dist = Math.sqrt(Math.pow(clickX - point.x, 2) + Math.pow(clickY - point.y, 2));
      if (dist < 25) {
        this.selectTrack(id);
        if (this.onTrackClickCallback) {
          this.onTrackClickCallback(trackData.aircraft);
        }

        // Select (not pin) - show in track panel
        if (this.trackDatabox) {
          this.trackDatabox.select(trackData.aircraft);
        }
        return;
      }
    }

    // Click on empty space deselects
    this.selectTrack(null);
    if (this.trackDatabox) {
      this.trackDatabox.deselect();
    }
  }

  /**
   * Handle mouse move for track hover detection
   * @param {Object} event - Leaflet mouse event
   */
  handleMapHover(event) {
    const hoverPoint = this.map.latLngToContainerPoint(event.latlng);
    const hoverX = hoverPoint.x;
    const hoverY = hoverPoint.y;

    let foundTrack = null;

    // Find if hover is near any track
    for (const [id, trackData] of this.tracks) {
      const pos = trackData.aircraft.getPosition();
      const point = this.map.latLngToContainerPoint([pos.lat, pos.lon]);

      const dist = Math.sqrt(Math.pow(hoverX - point.x, 2) + Math.pow(hoverY - point.y, 2));
      if (dist < 25) {
        foundTrack = { id, aircraft: trackData.aircraft };
        break;
      }
    }

    if (foundTrack) {
      // Change cursor to pointer when over a track
      this.container.style.cursor = 'pointer';

      if (this.hoveredTrackId !== foundTrack.id) {
        this.hoveredTrackId = foundTrack.id;

        if (this.onTrackHoverCallback) {
          this.onTrackHoverCallback(foundTrack.aircraft);
        }
      }
    } else {
      // Reset cursor when not over a track
      this.container.style.cursor = '';

      if (this.hoveredTrackId) {
        this.hoveredTrackId = null;
      }
    }
  }

  /**
   * Clear hover state
   */
  clearHover() {
    this.hoveredTrackId = null;
    this.container.style.cursor = '';
  }

  /**
   * Set the track databox reference
   * @param {TrackDatabox} databox
   */
  setTrackDatabox(databox) {
    this.trackDatabox = databox;
  }

  /**
   * Set the simulation reference for combat rendering
   * @param {Simulation} simulation
   */
  setSimulation(simulation) {
    this.simulation = simulation;
  }

  set onTrackClick(callback) {
    this.onTrackClickCallback = callback;
  }

  onTrackHover(callback) {
    this.onTrackHoverCallback = callback;
  }

  onMapRightClick(callback) {
    // Future implementation
  }

  onRulerDrag(callback) {
    // Future implementation
  }

  /**
   * Convert lat/lon to screen coordinates
   * @param {Object|number} latOrObj - Either {lat, lon} object or lat number
   * @param {number} [lon] - Longitude if first param is lat number
   * @returns {Object} {x, y} screen coordinates
   */
  latLonToScreen(latOrObj, lon) {
    let lat, lngVal;
    if (typeof latOrObj === 'object') {
      lat = latOrObj.lat;
      lngVal = latOrObj.lon !== undefined ? latOrObj.lon : latOrObj.lng;
    } else {
      lat = latOrObj;
      lngVal = lon;
    }
    return this.map.latLngToContainerPoint([lat, lngVal]);
  }

  screenToLatLon(x, y) {
    const ll = this.map.containerPointToLatLng([x, y]);
    return { lat: ll.lat, lon: ll.lng };
  }
}