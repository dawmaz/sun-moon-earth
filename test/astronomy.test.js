import test from "node:test";
import assert from "node:assert/strict";

import { computeState, phaseNameFromPhi } from "../src/astronomy.js";
import { LOCATIONS, observerFrame, altAz } from "../src/observer.js";
import {
  SCALE_PROFILES, earthDistanceScene, moonDistanceScene,
} from "../src/constants.js";

const scaleFns = { earthDistanceScene, moonDistanceScene };
const rad = Math.PI / 180;

function expectedAltitude(ra, dec, gmstDeg, location) {
  const hourAngle = (gmstDeg + location.lon) * rad - ra;
  const latitude = location.lat * rad;
  return Math.asin(
    Math.sin(latitude) * Math.sin(dec) +
    Math.cos(latitude) * Math.cos(dec) * Math.cos(hourAngle)
  );
}

function expectedAzimuth(ra, dec, gmstDeg, location) {
  const hourAngle = (gmstDeg + location.lon) * rad - ra;
  const latitude = location.lat * rad;
  const east = -Math.cos(dec) * Math.sin(hourAngle);
  const north = Math.sin(dec) * Math.cos(latitude) -
    Math.cos(dec) * Math.cos(hourAngle) * Math.sin(latitude);
  const azimuth = Math.atan2(east, north);
  return azimuth < 0 ? azimuth + 2 * Math.PI : azimuth;
}

test("scene observer altitudes agree with standard equatorial formula", () => {
  const dates = [
    new Date("2026-06-19T23:08:00Z"),
    new Date("2026-06-20T12:00:00Z"),
    new Date("2026-12-20T12:00:00Z"),
  ];

  for (const date of dates) {
    const state = computeState(date, SCALE_PROFILES.educational, scaleFns);
    for (const location of LOCATIONS) {
      const frame = observerFrame(state, location, SCALE_PROFILES.educational.earthRadius);
      const sun = altAz(state.earthToSun, frame);
      const moon = altAz(state.earthToMoon, frame);
      assert.ok(Math.abs(sun.alt - expectedAltitude(state.sun.ra, state.sun.dec, state.gmstDeg, location)) < 1e-10);
      assert.ok(Math.abs(moon.alt - expectedAltitude(state.moon.ra, state.moon.dec, state.gmstDeg, location)) < 1e-10);
      assert.ok(Math.abs(sun.az - expectedAzimuth(state.sun.ra, state.sun.dec, state.gmstDeg, location)) < 1e-10);
      assert.ok(Math.abs(moon.az - expectedAzimuth(state.moon.ra, state.moon.dec, state.gmstDeg, location)) < 1e-10);
    }
  }
});

test("phase names cover the eight conventional sectors", () => {
  const names = [
    "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
    "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent",
  ];
  names.forEach((name, index) => {
    assert.equal(phaseNameFromPhi(index * 45 * rad), name);
  });
});

test("realistic scale preserves physical radius and distance ratios", () => {
  const p = SCALE_PROFILES.realistic;
  assert.ok(Math.abs(p.moonRadius / p.earthRadius - 1737.4 / 6371) < 1e-12);
  assert.ok(Math.abs(p.sunRadius / p.earthRadius - 696340 / 6371) < 1e-12);
  assert.ok(Math.abs(p.moonOrbit / p.earthRadius - 384400 / 6371) < 1e-12);
});
