import { getBearing, m2nm } from '../util/math.js';

export class CursorInfo {
  constructor(container) {
    this.container = container;
    this.element = null;
    this.simulation = null;
    this.cursorLat = 0;
    this.cursorLon = 0;
  }

  init() {
    this.element = document.createElement('div');
    this.element.className = 'cursor-info';
    this.element.innerHTML = `
      <div class="bullseye">BULLSEYE ---/--</div>
      <div class="latlon">---.---° ---.---°</div>
    `;
    this.container.appendChild(this.element);
  }

  setSimulation(simulation) {
    this.simulation = simulation;
  }

  update(lat, lon) {
    if (!this.element || !this.simulation?.geoRef) return;

    this.cursorLat = lat;
    this.cursorLon = lon;

    const bullseyeText = this.formatBullseye(lat, lon);
    const latLonText = this.formatLatLon(lat, lon);

    this.element.querySelector('.bullseye').textContent = bullseyeText;
    this.element.querySelector('.latlon').textContent = latLonText;
  }

  formatBullseye(lat, lon) {
    const local = this.simulation.geoRef.toLocal(lat, lon);
    const bearing = getBearing({ x: 0, y: 0 }, { x: local.x, y: local.y });
    const rangeNm = m2nm(Math.sqrt(local.x * local.x + local.y * local.y));
    return `BULLSEYE ${String(Math.round(bearing)).padStart(3, '0')}/${Math.round(rangeNm)}`;
  }

  formatLatLon(lat, lon) {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    const latAbs = Math.abs(lat).toFixed(3);
    const lonAbs = Math.abs(lon).toFixed(3);
    return `${latAbs}°${latDir} ${lonAbs}°${lonDir}`;
  }

  hide() {
    if (this.element) {
      this.element.style.display = 'none';
    }
  }

  show() {
    if (this.element) {
      this.element.style.display = '';
    }
  }
}
