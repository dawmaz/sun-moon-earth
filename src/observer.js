// observer.js
// Observer locations and local-sky (horizon) geometry.
//
// Each city has latitude (deg, +N) and longitude (deg, +E). These are stored
// locally — no external API is used. The set covers every continent and
// includes Warsaw, Poland as required.

export const LOCATIONS = [
  { id: "warsaw",   name: "Warsaw, Poland",              continent: "Europe",          lat: 52.23,  lon: 21.01 },
  { id: "cairo",    name: "Cairo, Egypt",                continent: "Africa",          lat: 30.04,  lon: 31.24 },
  { id: "newyork",  name: "New York, USA (N. America)",  continent: "North America",   lat: 40.71,  lon: -74.01 },
  { id: "saopaulo", name: "São Paulo, Brazil (S. America)", continent: "South America", lat: -23.55, lon: -46.63 },
  { id: "tokyo",    name: "Tokyo, Japan (Asia)",         continent: "Asia",            lat: 35.68,  lon: 139.69 },
  { id: "sydney",   name: "Sydney, Australia",           continent: "Australia",       lat: -33.87, lon: 151.21 },
  { id: "mcmurdo",  name: "McMurdo Stn, Antarctica",     continent: "Antarctica",      lat: -77.85, lon: 166.67 },
];

export function getLocation(id) {
  return LOCATIONS.find((l) => l.id === id) || LOCATIONS[0];
}

// Earth's equatorial (spin) axis direction in the ecliptic scene frame.
// Scene axes are X=equinox, Y=ecliptic north, -Z=ecliptic longitude +90°.
// Converting the equatorial north pole gives (0, cos ε, -sin ε).
import { OBLIQUITY_DEG } from "./constants.js";
const EPS = (OBLIQUITY_DEG * Math.PI) / 180;
const EARTH_AXIS = { x: 0, y: Math.cos(EPS), z: -Math.sin(EPS) };

/**
 * Compute the observer's 3D position and local ENU basis in the scene, given
 * the system state and the Earth's radius (scene units).
 *
 * Greenwich's equatorial longitude is GMST; the location longitude is then
 * added to obtain local sidereal angle. The resulting equatorial vector is
 * converted explicitly to the scene's ecliptic axes. This keeps the
 * observer's local "up" vector consistent with the 3D scene, so the horizon
 * geometry the camera sees matches the altitude numbers in the panel.
 */
export function observerFrame(state, location, earthRadiusScene) {
  const phi = (location.lat * Math.PI) / 180;
  const lam = (location.lon * Math.PI) / 180;

  const gmst = (state.gmstDeg * Math.PI) / 180;
  const theta = gmst + lam;

  // Equatorial inertial vector: X points to the vernal equinox, Y to RA 6h,
  // and Z to the north celestial pole.
  const xEq = Math.cos(phi) * Math.cos(theta);
  const yEq = Math.cos(phi) * Math.sin(theta);
  const zEq = Math.sin(phi);

  // Equatorial -> ecliptic, followed by the conventional-ecliptic to scene
  // axis mapping (x, y, z) -> (x, z, -y).
  const dir = {
    x: xEq,
    y: -Math.sin(EPS) * yEq + Math.cos(EPS) * zEq,
    z: -(Math.cos(EPS) * yEq + Math.sin(EPS) * zEq),
  };

  const up = norm(dir);
  const center = state.earth.scenePos;
  const position = {
    x: center.x + up.x * earthRadiusScene,
    y: center.y + up.y * earthRadiusScene,
    z: center.z + up.z * earthRadiusScene,
  };

  // Local ENU basis in scene coords. North = projection of the spin axis onto
  // the horizon plane; East = Up × North (right-handed).
  const north = norm(sub(EARTH_AXIS, mul(up, dot(EARTH_AXIS, up))));
  const east = cross(north, up);

  return { up, north, east, position, lat: phi, lon: lam };
}

/**
 * Altitude (rad, above horizon) and azimuth (rad, from north toward east) of a
 * body whose direction-from-Earth unit vector is `bodyDir`, as seen by the
 * observer. Azimuth uses the compass convention (0=N, 90=E, 180=S, 270=W).
 */
export function altAz(bodyDir, frame) {
  const { up, north, east } = frame;
  const alt = Math.asin(clamp(dot(up, bodyDir), -1, 1));
  const horiz = norm(sub(bodyDir, mul(up, dot(up, bodyDir))));
  let az = Math.atan2(dot(horiz, east), dot(horiz, north));
  if (az < 0) az += Math.PI * 2;
  return { alt, az };
}

export function compassName(azRad) {
  const deg = (azRad * 180) / Math.PI;
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

// --- vector helpers ---
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function mul(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function norm(a) {
  const m = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / m, y: a.y / m, z: a.z / m };
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
