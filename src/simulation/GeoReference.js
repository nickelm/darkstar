export class GeoReference {
  constructor(originLat, originLon) {
    this.originLat = originLat;
    this.originLon = originLon;
    this.metersPerDegreeLat = 111320;
    this.metersPerDegreeLon = 111320 * Math.cos(this.deg2rad(originLat));
  }

  toLocal(lat, lon) {
    return {
      x: (lon - this.originLon) * this.metersPerDegreeLon,  // East
      y: (lat - this.originLat) * this.metersPerDegreeLat   // North
    };
  }

  toGeo(x, y) {
    return {
      lat: this.originLat + y / this.metersPerDegreeLat,
      lon: this.originLon + x / this.metersPerDegreeLon
    };
  }

  deg2rad(deg) {
    return deg * Math.PI / 180;
  }
}