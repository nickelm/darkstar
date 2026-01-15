export class MapView {
  constructor(container) {
    this.container = container;
    this.map = null;              // Leaflet map
    this.trackLayer = null;       // Canvas overlay
    
    this.tracks = new Map();      // id → track display object
    this.selectedTrack = null;
    this.pinnedTracks = [];
    
    this.bullseye = null;
    this.rangeRings = [];
  }

  init(center, zoom) {}
  
  setScenario(scenarioData) {}
  
  // Track management
  addTrack(aircraft) {}
  removeTrack(aircraftId) {}
  updateTrack(aircraft) {}
  updateAllTracks() {}
  
  // Selection
  selectTrack(aircraftId) {}
  pinTrack(aircraftId) {}
  unpinTrack(aircraftId) {}
  
  // Display elements
  drawBullseye(lat, lon) {}
  drawRangeRings(center, rings) {}
  drawMissile(missile) {}
  drawMerge(merge) {}
  drawAirbase(airbase) {}
  drawPatrolPattern(pattern) {}
  
  // Interaction
  onTrackClick(callback) {}
  onTrackHover(callback) {}
  onMapRightClick(callback) {}
  onRulerDrag(callback) {}
  
  // Utilities
  latLonToScreen(lat, lon) {}
  screenToLatLon(x, y) {}
}