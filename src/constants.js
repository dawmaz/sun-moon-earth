// constants.js
// Physical constants and scene scaling profiles.
// All astronomical formulas use degrees/radians as noted; scene units are
// arbitrary "scene units" — see SCALE_PROFILES below for how real-world
// quantities map to them. Two profiles are provided:
//   * "educational" — sizes and distances exaggerated so the system is viewable.
//   * "realistic"   — true size and distance ratios preserved (hard to view by
//                     design; demonstrates why educational scaling is needed).

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const TAU = Math.PI * 2;

// Real-world values (SI).
export const AU_KM = 1.495978707e8;            // 1 astronomical unit, km
export const EARTH_RADIUS_KM = 6371.0;
export const MOON_RADIUS_KM = 1737.4;
export const SUN_RADIUS_KM = 696340.0;
export const EARTH_MOON_DIST_KM = 384400.0;     // mean Earth–Moon distance
export const OBLIQUITY_DEG = 23.4392911;        // axial tilt of Earth (J2000)
export const MOON_ORBIT_INCL_DEG = 5.145;       // Moon orbit inclination to ecliptic
export const EARTH_SIDEREAL_DAY_H = 23.9344696; // sidereal day, hours

// Scene scale profiles. Every value is in scene units.
// "educational" deliberately breaks ratios so all three bodies and the Moon's
// orbit are simultaneously visible. "realistic" preserves true ratios so the
// Sun is ~109× Earth, the Moon is ~3.67× smaller than Earth, and 1 AU is
// ~389× the Earth–Moon distance.
export const SCALE_PROFILES = {
  educational: {
    label: "Educational scale (sizes & distances exaggerated for viewing)",
    realistic: false,
    sunRadius: 9.0,
    earthRadius: 2.4,
    moonRadius: 0.9,
    // The Sun–Earth distance is kept large relative to the Moon's orbit so the
    // 3D-lit terminator on the Moon matches the true phase to within a few
    // degrees (finite-Sun distortion ≈ atan(moonOrbit/earthOrbit) ≈ 3° here).
    earthOrbit: 300.0,        // Sun–Earth distance
    moonOrbit: 16.0,          // Earth–Moon distance (exaggerated vs real ratio)
    earthAxialTilt: OBLIQUITY_DEG,
    moonOrbitInclination: MOON_ORBIT_INCL_DEG,
  },
  realistic: {
    label: "Realistic scale (true size & distance ratios — very hard to view)",
    realistic: true,
    // Anchor: 1 Earth radius = 0.6 scene units. Everything else follows true ratios.
    earthRadius: 0.6,
    sunRadius: 0.6 * (SUN_RADIUS_KM / EARTH_RADIUS_KM),       // ~65.4
    moonRadius: 0.6 * (MOON_RADIUS_KM / EARTH_RADIUS_KM),     // ~0.163
    moonOrbit: 0.6 * (EARTH_MOON_DIST_KM / EARTH_RADIUS_KM),  // ~36.2 (60 Earth radii)
    earthOrbit: 0.6 * (EARTH_MOON_DIST_KM / EARTH_RADIUS_KM) * (AU_KM / EARTH_MOON_DIST_KM), // ~14059
    earthAxialTilt: OBLIQUITY_DEG,
    moonOrbitInclination: MOON_ORBIT_INCL_DEG,
  },
};

// Map a real Earth–Moon distance (km) to scene units given a profile.
// Educational: linear around mean distance -> profile.moonOrbit.
// Realistic: true km -> scene via the Earth-radius anchor.
export function moonDistanceScene(km, profile) {
  if (profile.realistic) {
    return (km / EARTH_RADIUS_KM) * profile.earthRadius;
  }
  return (km / EARTH_MOON_DIST_KM) * profile.moonOrbit;
}

// Map a real Sun–Earth distance (AU) to scene units.
export function earthDistanceScene(au, profile) {
  if (profile.realistic) {
    return au * (AU_KM / EARTH_RADIUS_KM) * profile.earthRadius;
  }
  return au * profile.earthOrbit; // 1 AU -> profile.earthOrbit
}
