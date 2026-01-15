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
  }

  init(center, zoom) {
    // Initialize Leaflet map
    this.map = L.map(this.container, {
      center: [center.lat, center.lon],
      zoom: zoom || 8,
      zoomControl: true
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
    this.canvasEl.style.pointerEvents = 'auto';
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

    // Handle clicks on canvas
    this.canvasEl.addEventListener('click', (e) => this.handleCanvasClick(e));
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

    // Draw all tracks
    for (const [id, trackData] of this.tracks) {
      this.drawTrack(trackData.aircraft, trackData.selected);
    }
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
    // Future implementation
  }

  drawMerge(merge) {
    // Future implementation
  }

  drawAirbase(airbase) {
    // Future implementation
  }

  drawPatrolPattern(pattern) {
    // Future implementation
  }

  handleCanvasClick(event) {
    const rect = this.canvasEl.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // Find if click is near any track
    for (const [id, trackData] of this.tracks) {
      const pos = trackData.aircraft.getPosition();
      const point = this.map.latLngToContainerPoint([pos.lat, pos.lon]);

      const dist = Math.sqrt(Math.pow(clickX - point.x, 2) + Math.pow(clickY - point.y, 2));
      if (dist < 25) {
        this.selectTrack(id);
        if (this.onTrackClickCallback) {
          this.onTrackClickCallback(trackData.aircraft);
        }
        return;
      }
    }

    // Click on empty space deselects
    this.selectTrack(null);
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

  latLonToScreen(lat, lon) {
    return this.map.latLngToContainerPoint([lat, lon]);
  }

  screenToLatLon(x, y) {
    const ll = this.map.containerPointToLatLng([x, y]);
    return { lat: ll.lat, lon: ll.lng };
  }
}