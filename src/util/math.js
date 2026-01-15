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
  constructor(x = 0, y = 0) {}
  get length() {}
  add(v) {}
  scale(s) {}
  normalize() {}
  getNormal() {}
  getInverse() {}
  dot(v) {}
}

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) {}
  get length() {}
  add(v) {}
  scale(s) {}
  normalize() {}
  getNormal() {}
  getInverse() {}
}

// Geometry
export function getVelocity(heading, pitch, speed) {}
export function getDistance(p1, p2) {}
export function getBearing(from, to) {}

// BRAA calculation
export function braa(pos1, vel1, pos2, vel2) {}

// Angle utilities
export function wrapDeg(deg) {}
export function toAspect(deg) {}
export function aspectToString(deg) {}

// Interpolation
export function lerp(a, b, t) {}
export function clamp(val, min, max) {}

// Random
export function getRandom(min, max) {}