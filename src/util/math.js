// Unit conversions
export const deg2rad = (deg) => deg * Math.PI / 180;
export const rad2deg = (rad) => rad * 180 / Math.PI;
export const kts2ms = (kts) => kts * 0.514444;
export const ms2kts = (ms) => ms / 0.514444;
export const nm2m = (nm) => nm * 1852;
export const m2nm = (m) => m / 1852;
export const ft2m = (ft) => ft * 0.3048;
export const m2ft = (m) => m / 0.3048;

// Vector operations
export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  get length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  add(v) {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  sub(v) {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  scale(s) {
    return new Vector2(this.x * s, this.y * s);
  }

  normalize() {
    const len = this.length;
    if (len === 0) return new Vector2();
    return new Vector2(this.x / len, this.y / len);
  }

  getNormal() {
    return new Vector2(-this.y, this.x);
  }

  getInverse() {
    return new Vector2(-this.x, -this.y);
  }

  dot(v) {
    return this.x * v.x + this.y * v.y;
  }
}

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  get length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  add(v) {
    return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  sub(v) {
    return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  scale(s) {
    return new Vector3(this.x * s, this.y * s, this.z * s);
  }

  normalize() {
    const len = this.length;
    if (len === 0) return new Vector3();
    return new Vector3(this.x / len, this.y / len, this.z / len);
  }

  getNormal() {
    return new Vector3(-this.y, this.x, 0);
  }

  getInverse() {
    return new Vector3(-this.x, -this.y, -this.z);
  }

  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  cross(v) {
    return new Vector3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }
}

// Geometry

// Create velocity vector from heading, pitch, and speed
// heading: degrees (0=N, 90=E), pitch: degrees, speed: m/s
export function getVelocity(heading, pitch, speed) {
  const headingRad = deg2rad(heading);
  const pitchRad = deg2rad(pitch);
  const horizontalSpeed = speed * Math.cos(pitchRad);
  return new Vector3(
    horizontalSpeed * Math.sin(headingRad),
    horizontalSpeed * Math.cos(headingRad),
    speed * Math.sin(pitchRad)
  );
}

// Distance between two Vector3 positions (meters)
export function getDistance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Bearing from one position to another (degrees, 0=N, 90=E)
export function getBearing(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const bearing = rad2deg(Math.atan2(dx, dy));
  return wrapDeg(bearing);
}

// BRAA calculation
// Calculate BRAA from observer (pos1, vel1) to target (pos2, vel2)
// Positions are Vector3 in local meters (x=east, y=north, z=altitude)
// Returns { bearing, range, altitude, aspect, aspectStr }
export function braa(pos1, vel1, pos2, vel2) {
  // Bearing: direction from observer to target (degrees)
  const bearing = getBearing(pos1, pos2);

  // Range: horizontal distance (nautical miles)
  const dx = pos2.x - pos1.x;
  const dy = pos2.y - pos1.y;
  const rangeMeters = Math.sqrt(dx * dx + dy * dy);
  const range = m2nm(rangeMeters);

  // Altitude: target altitude in feet
  const altitude = m2ft(pos2.z);

  // Aspect: angle between target's heading and bearing TO observer
  // 0° = hot (nose-on), 180° = cold (tail-on)
  const targetHeading = rad2deg(Math.atan2(vel2.x, vel2.y));
  const bearingToObserver = wrapDeg(bearing + 180);
  const aspect = toAspect(bearingToObserver - targetHeading);

  return {
    bearing: Math.round(bearing),
    range: Math.round(range),
    altitude: Math.round(altitude / 1000) * 1000,
    aspect: Math.round(aspect),
    aspectStr: aspectToString(aspect)
  };
}

// Angle utilities

// Normalize degrees to 0-360 range
export function wrapDeg(deg) {
  return ((deg % 360) + 360) % 360;
}

// Convert angle difference to aspect angle (0-180)
export function toAspect(deg) {
  const normalized = wrapDeg(deg);
  return normalized > 180 ? 360 - normalized : normalized;
}

// Convert aspect angle to standard brevity callout
export function aspectToString(deg) {
  if (deg <= 30) return 'HOT';
  if (deg <= 70) return 'FLANKING';
  if (deg <= 110) return 'BEAM';
  if (deg <= 150) return 'FLANKING';
  return 'COLD';
}

// Interpolation
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

// Random
export function getRandom(min, max) {
  return min + Math.random() * (max - min);
}