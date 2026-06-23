// main.js — application entry point.
// Owns the simulation clock, drives ephemeris recomputation, wires the UI,
// and renders the dynamic explanation panel.

import { Scene3D } from "./scene.js";
import { computeState } from "./astronomy.js";
import { LOCATIONS, getLocation, observerFrame, altAz, compassName } from "./observer.js";
import { SCALE_PROFILES, earthDistanceScene, moonDistanceScene } from "./constants.js";
import {
  makeEarthTextures, makeMoonTexture, makeSunTexture, makeSunGlowTexture,
} from "./textures.js";

const scaleFns = { earthDistanceScene, moonDistanceScene };

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const container = document.getElementById("scene-container");
const scene = new Scene3D(container);

// Loading indicator.
const loading = document.getElementById("loading");

(async function boot() {
  const [earth, moon, sun, glow] = await Promise.all([
    makeEarthTextures(),
    makeMoonTexture(),
    makeSunTexture(),
    Promise.resolve(makeSunGlowTexture()),
  ]);
  let borders = null;
  try {
    const response = await fetch("assets/data/country_boundaries.geojson");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    borders = await response.json();
  } catch (error) {
    console.warn("[sun-moon-earth] country boundaries unavailable", error);
  }
  await scene.init({
    day: earth.day, night: earth.night, clouds: earth.clouds,
    sun, moon, glow, borders,
  });
  loading.style.display = "none";

  populateLocations();
  wireUI();
  updateViewContext("space");
  $("scaleNote").textContent = scene.profile.label;
  syncDateInput();
  recompute(true);
  requestAnimationFrame(loop);
})();

// ---------------------------------------------------------------------------
// Simulation clock
// ---------------------------------------------------------------------------
let simTime = new Date();        // current simulated instant (UTC)
let isPlaying = false;
let speedDaysPerSec = 0.5;       // time multiplier (days of simulated time per real second)
let lastWall = performance.now();
let currentPreset = "space";

function loop(now) {
  const dt = (now - lastWall) / 1000;
  lastWall = now;
  if (isPlaying) {
    simTime = new Date(simTime.getTime() + dt * speedDaysPerSec * 86400000);
    syncDateInput();
  }
  recompute(false);
  requestAnimationFrame(loop);
}

function recompute(jump) {
  const state = computeState(simTime, scene.profile, scaleFns);
  scene.update(state, 1 / 60, isPlaying);
  updatePanels(state);
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

function populateLocations() {
  const sel = $("location");
  sel.innerHTML = LOCATIONS.map(
    (l) => `<option value="${l.id}">${l.name}</option>`
  ).join("");
  sel.value = "warsaw";
  scene.setLocation(getLocation("warsaw"));
}

function wireUI() {
  // Date / time.
  $("datetime").addEventListener("input", () => {
    const v = $("datetime").value;
    if (v) { simTime = new Date(v + ":00Z"); recompute(true); }
  });

  // Location.
  $("location").addEventListener("change", () => {
    const loc = getLocation($("location").value);
    scene.setLocation(loc);
    recompute(true);
    if (currentPreset === "observer") updateViewContext("observer");
  });

  // Play / pause.
  $("play").addEventListener("click", () => {
    isPlaying = !isPlaying;
    $("play").textContent = isPlaying ? "⏸ Pause" : "▶ Play";
  });

  // Speed.
  $("speed").addEventListener("input", (e) => {
    speedDaysPerSec = parseFloat(e.target.value);
    $("speedVal").textContent = formatSpeed(speedDaysPerSec);
  });
  $("speedVal").textContent = formatSpeed(speedDaysPerSec);

  // Time step buttons.
  $("stepBack").addEventListener("click", () => { simTime = new Date(simTime.getTime() - 86400000); syncDateInput(); recompute(true); });
  $("stepFwd").addEventListener("click", () => { simTime = new Date(simTime.getTime() + 86400000); syncDateInput(); recompute(true); });
  $("now").addEventListener("click", () => { simTime = new Date(); syncDateInput(); recompute(true); });

  // Camera presets.
  ["space", "earth", "top", "moon", "alignment", "observer"].forEach((p) => {
    $(p).addEventListener("click", () => {
      const state = computeState(simTime, scene.profile, scaleFns);
      scene.applyPreset(p, state);
      currentPreset = p;
      updateViewContext(p);
    });
  });
  $("resetCam").addEventListener("click", () => {
    const state = computeState(simTime, scene.profile, scaleFns);
    scene.resetCamera(state);
    currentPreset = "space";
    updateViewContext("space");
  });

  scene.onFreeNavigation = () => {
    currentPreset = "free";
    updateViewContext("free");
  };

  // Toggles.
  const toggle = (id, fn) => $(id).addEventListener("change", (e) => fn(e.target.checked));
  toggle("tOrbits", (v) => scene.toggleOrbits(v));
  toggle("tLabels", (v) => scene.toggleLabels(v));
  toggle("tBorders", (v) => scene.toggleBorders(v));
  toggle("tMoonLock", (v) => scene.toggleMoonLock(v));
  toggle("tRays", (v) => scene.toggleRays(v));
  toggle("tLines", (v) => scene.toggleLines(v));

  // Scale.
  document.querySelectorAll('input[name="scale"]').forEach((r) => {
    r.addEventListener("change", async (e) => {
      if (e.target.checked) {
        await scene.setScale(e.target.value);
        $("scaleNote").textContent = scene.profile.label;
        recompute(true);
      }
    });
  });

  window.addEventListener("resize", () => scene.resize());
}

function updateViewContext(mode) {
  const loc = getLocation($("location").value);
  const messages = {
    space: "3D space view · Moon orientation is camera-dependent",
    top: "Top-down space view · Moon orientation is camera-dependent",
    earth: "Earth-orbit camera · not the observer's Moon-disc orientation",
    moon: "Earth-facing Moon · matches the phase schematic",
    alignment: "Alignment view · orientation is camera-dependent",
    observer: `${loc.name} local sky · local vertical is up`,
    free: "Free 3D camera · Moon orientation can differ from the Earth view",
  };
  $("viewContext").textContent = messages[mode] || messages.free;
  $("viewContext").classList.toggle("matched", mode === "moon" || mode === "observer");
}

function syncDateInput() {
  // datetime-local value format (UTC rendered as if local; good enough for UI).
  const d = simTime;
  const pad = (n) => String(n).padStart(2, "0");
  $("datetime").value = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// ---------------------------------------------------------------------------
// Panels: phase + explanation + observer sky
// ---------------------------------------------------------------------------
function updatePanels(state) {
  const loc = getLocation($("location").value);
  const frame = observerFrame(state, loc, scene.profile.earthRadius);

  const sunAltAz = altAz(state.earthToSun, frame);
  const moonAltAz = altAz(state.earthToMoon, frame);
  const moonUp = moonAltAz.alt > 0;
  const sunUp = sunAltAz.alt > 0;

  // Date display.
  $("dateDisplay").textContent = simTime.toUTCString();

  // Phase panel.
  $("phaseName").textContent = state.phaseName;
  $("phaseIllum").textContent = `${(state.illuminatedFraction * 100).toFixed(1)}% illuminated`;
  $("phaseAge").textContent = `${(state.phasePhi / (2 * Math.PI) * 29.53).toFixed(1)} days into cycle (approx)`;
  $("phaseWax").textContent = state.waxing ? "Waxing (growing)" : "Waning (shrinking)";
  const rotationDeg = ((state.moon.longitude * 180 / Math.PI) % 360 + 360) % 360;
  $("moonRotation").textContent = `Synchronous rotation: ${rotationDeg.toFixed(0)}° · one turn per orbit`;
  drawPhaseMini(state);

  // Explanation panel.
  $("explain").innerHTML = buildExplanation(state, loc, sunAltAz, moonAltAz, sunUp, moonUp);

  // Observer sky panel.
  $("obsName").textContent = loc.name;
  $("obsLatLon").textContent = `lat ${loc.lat.toFixed(2)}°, lon ${loc.lon.toFixed(2)}°`;
  $("sunSky").textContent = `${(sunAltAz.alt * 180 / Math.PI).toFixed(1)}° alt, ${compassName(sunAltAz.az)} (${(sunAltAz.az * 180 / Math.PI).toFixed(0)}°) — ${sunUp ? "above horizon ☀" : "below horizon"}`;
  $("moonSky").textContent = `${(moonAltAz.alt * 180 / Math.PI).toFixed(1)}° alt, ${compassName(moonAltAz.az)} (${(moonAltAz.az * 180 / Math.PI).toFixed(0)}°) — ${moonUp ? "above horizon 🌙" : "below horizon (not visible)"}`;
}

function buildExplanation(state, loc, sunAltAz, moonAltAz, sunUp, moonUp) {
  const elong = (state.elongation * 180 / Math.PI).toFixed(0);
  const phaseAngle = (state.phaseAngle * 180 / Math.PI).toFixed(0);
  const moonAbove = moonAltAz.alt > 0;
  const sunAbove = sunAltAz.alt > 0;
  return `
  <p><b>Where is the Sun?</b> The Sun sits at the centre of the scene and lights
  everything from one direction. From Earth it currently lies
  <b>${(sunAltAz.alt * 180 / Math.PI).toFixed(0)}°</b> above the local horizon
  (compass <b>${compassName(sunAltAz.az)}</b>), so it is
  ${sunAbove ? "above" : "below"} the horizon for an observer in ${loc.name}.</p>

  <p><b>Where is the Moon?</b> The Moon orbits Earth and is currently
  <b>${(state.moon.distanceKm).toFixed(0)} km</b> away. As seen from Earth it is
  <b>${(moonAltAz.alt * 180 / Math.PI).toFixed(0)}°</b> above the horizon
  (compass <b>${compassName(moonAltAz.az)}</b>) —
  ${moonAbove ? "visible" : "below the horizon, so not currently visible"}.</p>

  <p><b>Which part of the Moon is lit?</b> Sunlight always illuminates exactly
  the half of the Moon facing the Sun. The angle Sun→Moon→Earth (the phase
  angle) is <b>${phaseAngle}°</b>, so about
  <b>${(state.illuminatedFraction * 100).toFixed(0)}%</b> of the Moon's
  Earth-facing hemisphere is in sunlight right now. The rest is in night.</p>

  <p><b>Why this phase?</b> The Sun–Earth–Moon elongation is <b>${elong}°</b>.
  Near 0° the Moon is between us and the Sun → <b>New Moon</b>; near 180° it is
  opposite the Sun → <b>Full Moon</b>; near 90°/270° → quarter phases. The Moon
  is currently <b>${state.phaseName}</b>
  (${state.waxing ? "waxing — the lit fraction is growing" : "waning — the lit fraction is shrinking"}).</p>

  <p><b>Does the Moon rotate?</b> Yes. It turns once during each roughly
  <b>27.3-day</b> orbit. Because both motions have the same period, the same
  lunar hemisphere remains directed toward Earth. Enable the cyan
  <b>Moon near-side marker</b>: it rotates through space with the Moon but keeps
  pointing at Earth, demonstrating tidal locking.</p>

  <p><b>Date &amp; location effect.</b> The selected date sets Earth's place in
  its orbit and the Moon's place in its orbit, which fixes the geometry above.
  The chosen location (${loc.name}) only changes <i>who</i> is looking: it sets
  whether the Sun and Moon are above your local horizon and how the lit crescent
  is oriented in your sky. ${loc.lat < 0 ? "From the southern hemisphere the Moon appears upside-down relative to the northern hemisphere." : ""}</p>

  <p class="sme-note">The Moon's disc you see in the 3D view is produced entirely
  by the Sun's light hitting the sphere — no phase image is substituted. Switch
  to <b>Earth-facing Moon</b> to match the north-up phase schematic, or to
  <b>Observer sky</b> for the local orientation at ${loc.name}. Other 3D camera
  angles can put the illuminated limb on a different side of the screen.</p>`;
}

// Small 2D schematic of the phase (derived from geometry, for the panel).
function drawPhaseMini(state) {
  const cv = $("phaseMini");
  const ctx = cv.getContext("2d");
  const w = cv.width, h = cv.height, cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 4;
  const image = ctx.createImageData(w, h);

  // View-space sunlight direction. +Z points from the Moon toward the viewer;
  // waxing phases are conventionally lit on the right in this north-up panel.
  const side = state.waxing ? 1 : -1;
  const sx = side * Math.sin(state.phaseAngle);
  const sz = Math.cos(state.phaseAngle);

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = (px + 0.5 - cx) / r;
      const y = (cy - py - 0.5) / r;
      const rr = x * x + y * y;
      if (rr > 1) continue;

      const z = Math.sqrt(1 - rr);
      const solar = x * sx + z * sz;
      const lit = Math.max(0, solar);
      const limb = 0.42 + 0.58 * z;
      // Tiny deterministic grain avoids a perfectly flat icon without adding
      // directional bands that could be mistaken for lunar surface features.
      const hash = ((px * 73856093) ^ (py * 19349663)) >>> 0;
      const albedo = 0.92 + 0.05 * ((hash & 255) / 255);
      const value = Math.round(18 + 225 * lit * limb * albedo);
      const i = (py * w + px) * 4;
      image.data[i] = value;
      image.data[i + 1] = Math.round(value * 0.98);
      image.data[i + 2] = Math.round(value * 0.93);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  ctx.strokeStyle = "#444"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
}

function formatSpeed(d) {
  if (d < 1) return `${(d * 24).toFixed(0)} hr/s`;
  if (d < 60) return `${d.toFixed(1)} days/s`;
  if (d < 365) return `${(d / 30).toFixed(1)} months/s`;
  return `${(d / 365).toFixed(2)} years/s`;
}
