import { getBearing, m2nm, wrapDeg } from '../util/math.js';

export class MeasurementTool {
  constructor(mapView) {
    this.mapView = mapView;
    this.simulation = null;

    // Current measurement state
    this.anchor = null;       // { type: 'point'|'track', lat, lon, trackId?, aircraft? }
    this.target = null;       // { type: 'point'|'track', lat, lon, trackId?, aircraft? }
    this.mode = 'idle';       // 'idle', 'measuring'

    // Pinned measurements
    this.measurements = [];   // Array of { anchor, target, bearing, range, reciprocal }
  }

  setSimulation(simulation) {
    this.simulation = simulation;
  }

  /**
   * Start a measurement from a point or track
   * @param {number} x - Screen x coordinate
   * @param {number} y - Screen y coordinate
   */
  startMeasure(x, y) {
    if (!this.simulation?.geoRef) return;

    // Check if clicking on a track
    const track = this.mapView.findTrackAtPoint(x, y);

    if (track) {
      const pos = track.aircraft.getPosition();
      this.anchor = {
        type: 'track',
        lat: pos.lat,
        lon: pos.lon,
        trackId: track.id,
        aircraft: track.aircraft
      };
    } else {
      const latLon = this.mapView.screenToLatLon(x, y);
      this.anchor = {
        type: 'point',
        lat: latLon.lat,
        lon: latLon.lon
      };
    }

    this.target = { ...this.anchor };
    this.mode = 'measuring';
  }

  /**
   * Update measurement target during drag
   * @param {number} x - Screen x coordinate
   * @param {number} y - Screen y coordinate
   */
  updateMeasure(x, y) {
    if (this.mode !== 'measuring') return;

    // Check if dragging over a track
    const track = this.mapView.findTrackAtPoint(x, y);

    if (track) {
      const pos = track.aircraft.getPosition();
      this.target = {
        type: 'track',
        lat: pos.lat,
        lon: pos.lon,
        trackId: track.id,
        aircraft: track.aircraft
      };
    } else {
      const latLon = this.mapView.screenToLatLon(x, y);
      this.target = {
        type: 'point',
        lat: latLon.lat,
        lon: latLon.lon
      };
    }

    this.mapView.render();
  }

  /**
   * End measurement, optionally pinning if Shift is held
   * @param {boolean} pin - Whether to pin this measurement
   */
  endMeasure(pin = false) {
    if (this.mode !== 'measuring') return;

    if (pin && this.anchor && this.target) {
      // Calculate and store the measurement
      const measurement = this.calculateMeasurement(this.anchor, this.target);
      if (measurement) {
        this.measurements.push({
          anchor: { ...this.anchor },
          target: { ...this.target },
          ...measurement
        });
      }
    }

    this.mode = 'idle';
    this.anchor = null;
    this.target = null;
    this.mapView.render();
  }

  /**
   * Calculate bearing, range, reciprocal between two points
   */
  calculateMeasurement(anchor, target) {
    if (!this.simulation?.geoRef) return null;

    // Get current positions (for tracks, get live position)
    let anchorLat = anchor.lat;
    let anchorLon = anchor.lon;
    let targetLat = target.lat;
    let targetLon = target.lon;

    if (anchor.type === 'track' && anchor.aircraft) {
      const pos = anchor.aircraft.getPosition();
      anchorLat = pos.lat;
      anchorLon = pos.lon;
    }

    if (target.type === 'track' && target.aircraft) {
      const pos = target.aircraft.getPosition();
      targetLat = pos.lat;
      targetLon = pos.lon;
    }

    const anchorLocal = this.simulation.geoRef.toLocal(anchorLat, anchorLon);
    const targetLocal = this.simulation.geoRef.toLocal(targetLat, targetLon);

    const bearing = getBearing(
      { x: anchorLocal.x, y: anchorLocal.y },
      { x: targetLocal.x, y: targetLocal.y }
    );

    const dx = targetLocal.x - anchorLocal.x;
    const dy = targetLocal.y - anchorLocal.y;
    const rangeMeters = Math.sqrt(dx * dx + dy * dy);
    const range = m2nm(rangeMeters);

    const reciprocal = wrapDeg(bearing + 180);

    return {
      bearing: Math.round(bearing),
      range: Math.round(range),
      reciprocal: Math.round(reciprocal)
    };
  }

  /**
   * Clear all pinned measurements
   */
  clearMeasurements() {
    this.measurements = [];
    this.mapView.render();
  }

  /**
   * Draw measurements on the canvas
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    // Draw pinned measurements
    for (const m of this.measurements) {
      this.drawMeasurement(ctx, m.anchor, m.target, true);
    }

    // Draw current measurement if active
    if (this.mode === 'measuring' && this.anchor && this.target) {
      this.drawMeasurement(ctx, this.anchor, this.target, false);
    }
  }

  /**
   * Draw a single measurement line with label
   */
  drawMeasurement(ctx, anchor, target, pinned) {
    const measurement = this.calculateMeasurement(anchor, target);
    if (!measurement) return;

    // Get screen positions (live for tracks)
    let anchorPos, targetPos;

    if (anchor.type === 'track' && anchor.aircraft) {
      const pos = anchor.aircraft.getPosition();
      anchorPos = this.mapView.latLonToScreen(pos.lat, pos.lon);
    } else {
      anchorPos = this.mapView.latLonToScreen(anchor.lat, anchor.lon);
    }

    if (target.type === 'track' && target.aircraft) {
      const pos = target.aircraft.getPosition();
      targetPos = this.mapView.latLonToScreen(pos.lat, pos.lon);
    } else {
      targetPos = this.mapView.latLonToScreen(target.lat, target.lon);
    }

    ctx.save();

    // Draw dashed line
    ctx.strokeStyle = pinned ? '#00BFFF' : '#ffcc00';
    ctx.setLineDash([8, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(anchorPos.x, anchorPos.y);
    ctx.lineTo(targetPos.x, targetPos.y);
    ctx.stroke();

    // Draw endpoint markers
    ctx.setLineDash([]);
    ctx.fillStyle = pinned ? '#00BFFF' : '#ffcc00';

    // Anchor marker
    ctx.beginPath();
    ctx.arc(anchorPos.x, anchorPos.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Target marker
    ctx.beginPath();
    ctx.arc(targetPos.x, targetPos.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw label at midpoint
    const midX = (anchorPos.x + targetPos.x) / 2;
    const midY = (anchorPos.y + targetPos.y) / 2;

    const bearingStr = String(measurement.bearing).padStart(3, '0');
    const reciprocalStr = String(measurement.reciprocal).padStart(3, '0');
    const label = `${bearingStr}° / ${measurement.range}nm / ${reciprocalStr}°`;

    // Background for label
    ctx.font = '12px "Courier New", monospace';
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(37, 37, 64, 0.9)';
    ctx.fillRect(midX - textWidth / 2 - 4, midY - 18, textWidth + 8, 16);

    // Label text
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, midX, midY - 10);

    ctx.restore();
  }
}
