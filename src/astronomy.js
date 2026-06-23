// astronomy.js
// Low-precision ephemeris for the Sun, Earth, and Moon, plus geometric Moon
// phase derivation. All formulas are standard "textbook" approximations
// (Meeus, "Astronomical Algorithms") good to ~1° for the Sun and ~1–2° for the
// Moon — more than adequate for an educational visualization.
//
// Coordinate convention used throughout the 3D scene:
//   * Ecliptic plane = the scene's XZ plane.
//   * +Y = ecliptic north pole.
//   * +X = direction of the vernal equinox (ecliptic longitude λ = 0).
//   * λ increases toward -Z. This makes (equinox, longitude +90°, north)
//     right-handed while retaining +Y as the scene's visible "up" axis.
// A body at ecliptic (λ, β, r) is placed at:
//   x = r·cosβ·cosλ,  y = r·sinβ,  z = -r·cosβ·sinλ.

import { DEG, RAD, TAU, OBLIQUITY_DEG } from "./constants.js";

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Julian Date from a JS Date (treated as UTC). */
export function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Julian centuries since J2000.0 (TT ≈ UT for this precision). */
export function jCentury(jd) {
  return (jd - 2451545.0) / 36525.0;
}

/** Greenwich Mean Sidereal Time in degrees for a given JD (Meeus 12.4). */
export function gmstDegrees(jd) {
  const T = jCentury(jd);
  let theta =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38710000.0;
  // normalize to [0, 360)
  theta = ((theta % 360) + 360) % 360;
  return theta;
}

// ---------------------------------------------------------------------------
// Sun (geocentric ecliptic). Meeus ch.25, low-precision series.
// Returns longitude λ (rad, geocentric), distance R (AU), and mean anomaly.
// ---------------------------------------------------------------------------
function sunGeocentric(jd) {
  const T = jCentury(jd);
  const L0 = (280.46646 + 36000.76983 * T) % 360;        // mean longitude, deg
  const M = ((357.52911 + 35999.05029 * T) % 360) * DEG; // mean anomaly, rad
  const e = 0.016708634 - 0.000042037 * T;

  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M); // deg (equation of center)

  const trueLongDeg = L0 + C;                          // geocentric ecliptic longitude, deg
  const trueAnom = M + (C * DEG);                       // true anomaly, rad
  const R = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(trueAnom)); // AU

  return {
    longitude: ((trueLongDeg % 360) + 360) % 360 * DEG, // rad, normalized
    distanceAU: R,
  };
}

// ---------------------------------------------------------------------------
// Moon (geocentric ecliptic). Simplified lunar theory: mean elements plus the
// largest periodic terms (Meeus, "low-precision" lunar position). Yields
// longitude/latitude/distance good to a couple of degrees.
// Returns λ, β (rad) and distance Δ (km).
// ---------------------------------------------------------------------------
function moonGeocentric(jd) {
  const T = jCentury(jd);
  // Mean elements (degrees).
  const Lp = (218.3164477 + 481267.88123421 * T) % 360; // Moon mean longitude
  const D = (297.8501921 + 445267.1114034 * T) % 360;   // mean elongation Moon–Sun
  const M = (357.5291092 + 35999.0502909 * T) % 360;    // Sun mean anomaly
  const Mp = (134.9633964 + 477198.8675055 * T) % 360;  // Moon mean anomaly
  const F = (93.272095 + 483166.5173 * T) % 360;        // argument of latitude

  const d = (a) => (a * DEG); // to radians
  // Longitude periodic terms (degrees), biggest contributors.
  let dLon =
    6.289 * Math.sin(d(Mp)) -
    1.274 * Math.sin(d(2 * D - Mp)) +
    0.658 * Math.sin(d(2 * D)) -
    0.186 * Math.sin(d(M)) -
    0.059 * Math.sin(d(2 * Mp - 2 * D)) -
    0.057 * Math.sin(d(2 * D - M - Mp)) +
    0.053 * Math.sin(d(2 * D + Mp)) +
    0.046 * Math.sin(d(2 * D - M)) +
    0.041 * Math.sin(d(Mp - M)) -
    0.035 * Math.sin(d(D)) -
    0.031 * Math.sin(d(Mp + M)) -
    0.015 * Math.sin(d(2 * F - 2 * D)) +
    0.011 * Math.sin(d(Mp - 2 * D));

  // Latitude periodic terms (degrees).
  let dLat =
    5.128 * Math.sin(d(F)) +
    0.2806 * Math.sin(d(Mp + F)) +
    0.2777 * Math.sin(d(Mp - F)) +
    0.1732 * Math.sin(d(2 * D - F)) +
    0.0554 * Math.sin(d(2 * D + F - Mp)) +
    0.0462 * Math.sin(d(2 * D - F - Mp)) +
    0.0326 * Math.sin(d(2 * D + F)) +
    0.0172 * Math.sin(d(2 * Mp + F)) +
    0.0093 * Math.sin(d(2 * D + Mp - F)) +
    0.0088 * Math.sin(d(2 * Mp - F)) +
    0.0082 * Math.sin(d(2 * D - M - F)) +
    0.0043 * Math.sin(d(2 * D - F - M)) +
    0.0042 * Math.sin(d(2 * D + F + Mp));

  // Distance (km): mean + largest periodic term.
  const dist =
    385001 -
    20905 * Math.cos(d(Mp)) -
    3699 * Math.cos(d(2 * D - Mp)) -
    2956 * Math.cos(d(2 * D)) -
    570 * Math.cos(d(2 * Mp)) +
    246 * Math.cos(d(2 * F)) -
    205 * Math.cos(d(M - Mp)) -
    171 * Math.cos(d(Mp + 2 * D)) -
    152 * Math.cos(d(2 * D - M - Mp));

  const lon = (((Lp + dLon) % 360) + 360) % 360;
  const lat = dLat; // stays small (±~5.3°)
  return { longitude: lon * DEG, latitude: lat * DEG, distanceKm: dist };
}

// ---------------------------------------------------------------------------
// Place a body in the scene's ecliptic frame.
// ---------------------------------------------------------------------------
export function eclipticToScene(lambda, beta, r) {
  const cb = Math.cos(beta);
  return {
    x: r * cb * Math.cos(lambda),
    y: r * Math.sin(beta),
    z: -r * cb * Math.sin(lambda),
  };
}

// ---------------------------------------------------------------------------
// Ecliptic -> equatorial conversion (for RA/Dec and local sky math).
// Obliquity ε tilts the equator relative to the ecliptic.
// ---------------------------------------------------------------------------
const eps = OBLIQUITY_DEG * DEG;

/** Equatorial right ascension (rad) from ecliptic (λ, β). */
export function eclipticToRA(lambda, beta) {
  return Math.atan2(
    Math.sin(lambda) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps),
    Math.cos(lambda)
  );
}
/** Equatorial declination (rad) from ecliptic (λ, β). */
export function eclipticToDec(lambda, beta) {
  return Math.asin(
    Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lambda)
  );
}

// ---------------------------------------------------------------------------
// Assemble the full system state for a given instant.
// Positions are returned in BOTH ecliptic scene coordinates (for rendering)
// and as angles (for the explanation panel & local-sky math).
// ---------------------------------------------------------------------------
export function computeState(date, profile, scaleFns) {
  const jd = julianDate(date);
  const T = jCentury(jd);

  const sun = sunGeocentric(jd);                 // geocentric
  const moon = moonGeocentric(jd);               // geocentric

  // Earth heliocentric position = opposite of the Sun's geocentric direction.
  const earthHelioLong = sun.longitude + Math.PI; // rad
  const earthDistAU = sun.distanceAU;

  // Scene distances (units depend on profile).
  const earthSceneDist = scaleFns.earthDistanceScene(earthDistAU, profile);
  const moonSceneDist = scaleFns.moonDistanceScene(moon.distanceKm, profile);

  // Scene positions.
  const sunPos = { x: 0, y: 0, z: 0 };
  const earthPos = eclipticToScene(earthHelioLong, 0, earthSceneDist);
  const moonRelEarth = eclipticToScene(moon.longitude, moon.latitude, moonSceneDist);
  const moonPos = {
    x: earthPos.x + moonRelEarth.x,
    y: earthPos.y + moonRelEarth.y,
    z: earthPos.z + moonRelEarth.z,
  };

  // --- Moon phase geometry, derived from the 3D vectors (NOT from a formula) ---
  // Vectors:
  const earthToSun = norm(sub(sunPos, earthPos));   // direction of sunlight at Earth
  const earthToMoon = norm(sub(moonPos, earthPos)); // direction of Moon from Earth
  const moonToSun = norm(sub(sunPos, moonPos));
  const moonToEarth = norm(sub(earthPos, moonPos));

  // Elongation ψ: Sun–Earth–Moon angle at Earth (0 = new, 180 = full).
  // This is computed from the true ecliptic longitudes/latitudes, so it is
  // EXACT regardless of the scene's distance scaling (directions are
  // scale-independent). This is the geometric quantity that fixes the phase.
  const elongation = Math.acos(clamp(dot(earthToSun, earthToMoon), -1, 1));

  // Phase angle i: Sun–Moon–Earth angle at the Moon. The Sun is effectively at
  // infinity relative to the Earth–Moon distance (1 AU ≈ 389× the Moon's
  // distance), so i = π − ψ exactly to far better than our precision. We use
  // this distant-Sun relation rather than the scene vectors so the result is
  // correct in BOTH educational and realistic scale (the scene vectors would be
  // corrupted by the exaggerated distance ratio in educational scale).
  const phaseAngle = Math.PI - elongation;
  const illuminatedFraction = (1 + Math.cos(phaseAngle)) / 2; // = (1 − cos ψ)/2

  // Phase "direction" angle φ ∈ [0,360): 0 new, 90 first quarter, 180 full, 270 last quarter.
  // Uses geocentric ecliptic longitudes (waxing = Moon east of Sun).
  let phi = (((moon.longitude - sun.longitude) % TAU) + TAU) % TAU;
  const phaseName = phaseNameFromPhi(phi);
  const waxing = phi > 0 && phi < Math.PI;

  // Sun equatorial coords (for local-sky altitude of the Sun).
  const sunRA = eclipticToRA(sun.longitude, 0);
  const sunDec = eclipticToDec(sun.longitude, 0);
  const moonRA = eclipticToRA(moon.longitude, moon.latitude);
  const moonDec = eclipticToDec(moon.longitude, moon.latitude);

  return {
    date,
    jd,
    T,
    gmstDeg: gmstDegrees(jd),
    sun: { ...sun, ra: sunRA, dec: sunDec, scenePos: sunPos },
    moon: { ...moon, ra: moonRA, dec: moonDec, scenePos: moonPos, relEarth: moonRelEarth },
    earth: { helioLong: earthHelioLong, distAU: earthDistAU, scenePos: earthPos },
    elongation,            // rad
    phaseAngle,            // rad
    illuminatedFraction,   // 0..1
    phasePhi: phi,         // rad 0..2π
    phaseName,
    waxing,
    // handy unit vectors
    earthToSun,
    earthToMoon,
    moonToSun,
  };
}

export function phaseNameFromPhi(phi) {
  // phi in radians, 0 = new moon.
  const d = (phi * RAD) % 360;
  const b = [
    [22.5, "New Moon"],
    [67.5, "Waxing Crescent"],
    [112.5, "First Quarter"],
    [157.5, "Waxing Gibbous"],
    [202.5, "Full Moon"],
    [247.5, "Waning Gibbous"],
    [292.5, "Last Quarter"],
    [337.5, "Waning Crescent"],
    [360.1, "New Moon"],
  ];
  for (const [edge, name] of b) if (d < edge) return name;
  return "New Moon";
}

// --- tiny vector helpers (plain {x,y,z}) ---
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function norm(a) {
  const m = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / m, y: a.y / m, z: a.z / m };
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
