export class GeoReference {
  constructor(originLat, originLon) {
    this.originLat = originLat;
    this.originLon = originLon;
    this.metersPerDegreeLat = 111320;
    this.metersPerDegreeLon = 111320 * Math.cos(this.deg2rad(originLat));
  }

  toLocal(lat, lon) {}   // Returns { x, y } in meters
  toGeo(x, y) {}         // Returns { lat, lon }
  
  deg2rad(deg) {}
}