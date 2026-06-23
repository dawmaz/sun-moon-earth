// scene.js
// Three.js scene assembly: renderer, camera, OrbitControls, CSS2D labels,
// orbital paths, Sun–Earth–Moon lines, observer marker, sunlight rays, camera
// presets, and switching between educational / realistic scale.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { createSun, createEarth, createMoon } from "./bodies.js";
import { observerFrame } from "./observer.js";
import { SCALE_PROFILES, OBLIQUITY_DEG } from "./constants.js";

const EARTH_AXIS = new THREE.Vector3(
  0,
  Math.cos(OBLIQUITY_DEG * Math.PI / 180),
  -Math.sin(OBLIQUITY_DEG * Math.PI / 180)
);

export class Scene3D {
  constructor(container) {
    this.container = container;
    this.profile = SCALE_PROFILES.educational;
    this.showOrbits = true;
    this.showLabels = true;
    this.showBorders = true;
    this.showMoonLock = true;
    this.showRays = true;
    this.showLines = true;
    this.cameraMode = "free"; // 'free' | 'observer' | 'moon'
    this.observer = null;     // observer frame from observer.js
    this.locationId = "warsaw";
  }

  async init(textures) {
    this.textures = textures;

    // --- Renderer ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);

    // --- CSS2D label layer (overlays DOM labels on 3D points) ---
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.labelRenderer.domElement.style.position = "absolute";
    this.labelRenderer.domElement.style.top = "0";
    this.labelRenderer.domElement.style.pointerEvents = "none";
    this.container.appendChild(this.labelRenderer.domElement);

    // --- Scene & camera ---
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060a);

    // Starfield background.
    this.scene.add(makeStars());

    this.camera = new THREE.PerspectiveCamera(
      50,
      this.container.clientWidth / this.container.clientHeight,
      0.01,
      200000
    );
    this.camera.position.set(350, 260, 460);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.8;
    this.controls.zoomSpeed = 1.1;
    this.controls.panSpeed = 0.8;
    this.controls.minDistance = 0.05;
    this.controls.maxDistance = 80000;
    this.controls.addEventListener("start", () => {
      if (this.cameraMode !== "observer" && this.onFreeNavigation) {
        this.onFreeNavigation();
      }
    });

    // Very dim ambient so dark sides aren't pure black (not physical, just for
    // visibility — documented as an approximation).
    this.ambient = new THREE.AmbientLight(0x223344, 0.12);
    this.scene.add(this.ambient);

    // --- Build bodies ---
    this.sunBody = createSun(this.profile, this.textures);
    this.earthBody = createEarth(this.profile, this.textures);
    this.moonBody = createMoon(this.profile, this.textures.moon);
    this.systemGroup = new THREE.Group();
    this.systemGroup.add(this.sunBody.object, this.earthBody.object, this.moonBody.object);
    this.scene.add(this.systemGroup);

    // --- Labels ---
    this.labels = {
      sun: makeLabel("Sun"),
      earth: makeLabel("Earth"),
      moon: makeLabel("Moon"),
    };
    this.sunBody.object.add(this.labels.sun);
    this.earthBody.object.add(this.labels.earth);
    this.moonBody.mesh.add(this.labels.moon);
    this.updateLabelVisibility();

    // --- Helpers ---
    this._buildHelpers();

    // Observer marker (on Earth's surface).
    this.observerMarker = new THREE.Mesh(
      new THREE.SphereGeometry(this.profile.earthRadius * 0.06, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x00ffff })
    );
    this.observerBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(this.profile.earthRadius * 0.01, this.profile.earthRadius * 0.01, this.profile.earthRadius * 0.5, 8),
      new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 })
    );
    // Observer marker/beam live on the untransformed system group (their
    // positions are computed in world/ecliptic coordinates).
    this.systemGroup.add(this.observerMarker, this.observerBeam);

    this.controls.target.set(0, 0, 0);
  }

  // -------------------------------------------------------------------------
  // Helpers (orbits, lines, sunlight rays)
  // -------------------------------------------------------------------------
  _buildHelpers() {
    // Earth orbit (circular approximation in the ecliptic plane; the real orbit
    // has e ≈ 0.0167, neglected here — see README).
    this.earthOrbit = makeCircle(this.profile.earthOrbit, 0x4466aa, 256);
    this.scene.add(this.earthOrbit);

    // Moon orbit (around Earth; plane inclined to the ecliptic).
    this.moonOrbit = makeInclinedCircle(this.profile.moonOrbit, this.profile.moonOrbitInclination, 0x886644, 256);
    this.scene.add(this.moonOrbit);

    // Sun–Earth, Earth–Moon, Sun–Moon lines.
    this.sunEarthLine = makeLine(0xffcc66);
    this.earthMoonLine = makeLine(0x66ccff);
    this.sunMoonLine = makeLine(0xaa8855);
    this.scene.add(this.sunEarthLine, this.earthMoonLine, this.sunMoonLine);

    // Sunlight rays (dashed) from the Sun toward Earth and Moon.
    this.rayEarth = makeDashedLine(0xffeeaa);
    this.rayMoon = makeDashedLine(0xffeeaa);
    this.scene.add(this.rayEarth, this.rayMoon);
  }

  _updateHelpers(state) {
    const S = state.sun.scenePos, E = state.earth.scenePos, M = state.moon.scenePos;

    this.moonOrbit.position.set(E.x, E.y, E.z);

    setLine(this.sunEarthLine, S, E);
    setLine(this.earthMoonLine, E, M);
    setLine(this.sunMoonLine, S, M);

    // Sunlight rays: short segments leaving the Sun toward each body.
    const dE = dir(S, E), dM = dir(S, M);
    const r = this.profile.sunRadius;
    setLine(this.rayEarth, add(S, mul(dE, r * 1.05)), add(E, mul(dE, -this.profile.earthRadius * 1.5)));
    setLine(this.rayMoon, add(S, mul(dM, r * 1.05)), add(M, mul(dM, -this.profile.moonRadius * 1.5)));

    this.earthOrbit.visible = this.showOrbits;
    this.moonOrbit.visible = this.showOrbits;
    this.sunEarthLine.visible = this.showLines;
    this.earthMoonLine.visible = this.showLines;
    this.sunMoonLine.visible = this.showLines;
    this.rayEarth.visible = this.showRays;
    this.rayMoon.visible = this.showRays;
  }

  _updateObserver(state) {
    if (!this.observer) return;
    const p = this.observer.position;
    this.observerMarker.position.set(p.x, p.y, p.z);
    // Beam points "up" from the surface (along observer up), centered above surface.
    const up = this.observer.up;
    const len = this.profile.earthRadius * 0.5;
    const mid = { x: p.x + up.x * len / 2, y: p.y + up.y * len / 2, z: p.z + up.z * len / 2 };
    this.observerBeam.position.set(mid.x, mid.y, mid.z);
    // Orient cylinder's +Y to up.
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(up.x, up.y, up.z));
    this.observerBeam.quaternion.copy(q);
  }

  // -------------------------------------------------------------------------
  // Per-frame update (called by main loop)
  // -------------------------------------------------------------------------
  update(state, dt, isPlaying) {
    this.sunBody.update(state, dt);
    this.earthBody.update(state, dt, isPlaying);
    this.moonBody.update(state);
    if (this.earthBody.borders) this.earthBody.borders.visible = this.showBorders;
    if (this.moonBody.lockHelper) this.moonBody.lockHelper.visible = this.showMoonLock;
    this._updateHelpers(state);

    // Recompute observer frame so the marker tracks Earth's rotation/orbit.
    const loc = this._locationObj();
    this.observer = observerFrame(state, loc, this.profile.earthRadius);
    this._updateObserver(state);

    // Position labels slightly above each body.
    this.labels.sun.position.set(0, this.profile.sunRadius * 1.15, 0);
    this.labels.earth.position.set(0, this.profile.earthRadius * 1.3, 0);
    this.labels.moon.position.set(0, this.profile.moonRadius * 1.4, 0);

    if (this.cameraMode === "observer") {
      this._updateObserverCamera(state);
    } else if (this.cameraMode === "moon") {
      this._updateMoonCamera(state);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  _locationObj() {
    // resolved by main via setLocationId; keep a cached object
    return this._locObj || { lat: 52.23, lon: 21.01, name: "Warsaw, Poland" };
  }
  setLocation(locObj) { this._locObj = locObj; this.locationId = locObj.id; }

  // -------------------------------------------------------------------------
  // Observer (local-sky) camera: stand on the surface, look at the Moon.
  // -------------------------------------------------------------------------
  _updateObserverCamera(state) {
    const f = this.observer;
    if (!f) return;
    const up = new THREE.Vector3(f.up.x, f.up.y, f.up.z);
    const eye = new THREE.Vector3(f.position.x, f.position.y, f.position.z).addScaledVector(up, this.profile.earthRadius * 0.05);
    this.camera.position.copy(eye);
    const moon = state.moon.scenePos;
    this.camera.up.copy(up);
    // If the Moon is below the horizon, look toward its azimuth at horizon level.
    const moonDir = new THREE.Vector3(moon.x - f.position.x, moon.y - f.position.y, moon.z - f.position.z).normalize();
    const dotUp = moonDir.dot(up);
    let target;
    if (dotUp > -0.05) {
      target = new THREE.Vector3(moon.x, moon.y, moon.z);
    } else {
      // Project moon direction onto the horizon plane and look that way.
      const horiz = moonDir.clone().addScaledVector(up, -dotUp).normalize();
      target = eye.clone().addScaledVector(horiz, this.profile.moonRadius * 2 + this.profile.moonOrbit);
    }
    this.camera.lookAt(target);
    this.camera.fov = 35;
    this.camera.updateProjectionMatrix();
  }

  // Track the moving Moon from Earth's direction. This makes the synchronous
  // rotation demonstration stable while time advances or dates are stepped.
  _updateMoonCamera(state) {
    const E = state.earth.scenePos, M = state.moon.scenePos;
    const towardEarth = dir(M, E);
    this.camera.up.copy(EARTH_AXIS);
    this.camera.position.set(
      M.x + towardEarth.x * this.profile.moonRadius * 4,
      M.y + towardEarth.y * this.profile.moonRadius * 4,
      M.z + towardEarth.z * this.profile.moonRadius * 4
    );
    this.controls.target.set(M.x, M.y, M.z);
    this.camera.lookAt(M.x, M.y, M.z);
  }

  // -------------------------------------------------------------------------
  // Camera presets
  // -------------------------------------------------------------------------
  applyPreset(name, state) {
    this.cameraMode = "free";
    this.controls.enabled = true;
    this.camera.up.set(0, 1, 0);
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();
    const E = state.earth.scenePos, M = state.moon.scenePos;
    const r = this.profile;
    switch (name) {
      case "space":
        this._setCam({ x: r.earthOrbit * 1.2, y: r.earthOrbit * 0.5, z: r.earthOrbit * 1.6 }, { x: 0, y: 0, z: 0 });
        break;
      case "earth":
        this._setCam({ x: E.x + r.earthRadius * 4, y: E.y + r.earthRadius * 2, z: E.z + r.earthRadius * 4 }, E);
        break;
      case "top":
        this._setCam({ x: 0, y: r.earthOrbit * 1.2, z: 0.001 }, { x: 0, y: 0, z: 0 });
        break;
      case "moon":
        // View the Moon from Earth's direction so this close-up shows the same
        // phase and tidally locked near side that an Earth observer sees.
        this.cameraMode = "moon";
        this.controls.enabled = false;
        this._updateMoonCamera(state);
        break;
      case "alignment": {
        // Look along the Sun–Earth–Moon line from the Earth side toward the Moon.
        const d = dir(E, M);
        this._setCam({ x: E.x - d.x * r.moonRadius * 4, y: E.y - d.y * r.moonRadius * 4 + r.moonRadius, z: E.z - d.z * r.moonRadius * 4 }, M);
        break;
      }
      case "observer":
        this.cameraMode = "observer";
        this.controls.enabled = false;
        break;
    }
  }

  _setCam(pos, target) {
    this.camera.position.set(pos.x, pos.y, pos.z);
    this.controls.target.set(target.x, target.y, target.z);
    this.controls.update();
  }

  resetCamera(state) { this.applyPreset("space", state); }

  // -------------------------------------------------------------------------
  // Scale switching: rebuild bodies & helpers at new sizes.
  // -------------------------------------------------------------------------
  async setScale(profileName) {
    this.profile = SCALE_PROFILES[profileName] || SCALE_PROFILES.educational;

    // Dispose old body geometries/materials.
    this.systemGroup.remove(this.sunBody.object, this.earthBody.object, this.moonBody.object);
    disposeObject(this.sunBody.object);
    disposeObject(this.earthBody.object);
    disposeObject(this.moonBody.object);

    this.sunBody = createSun(this.profile, this.textures);
    this.earthBody = createEarth(this.profile, this.textures);
    this.moonBody = createMoon(this.profile, this.textures.moon);
    this.systemGroup.add(this.sunBody.object, this.earthBody.object, this.moonBody.object);

    this.sunBody.object.add(this.labels.sun);
    this.earthBody.object.add(this.labels.earth);
    this.moonBody.mesh.add(this.labels.moon);
    // observerMarker/Beam remain parented to systemGroup across rebuilds.

    // Rebuild helpers with new radii.
    this.scene.remove(this.earthOrbit, this.moonOrbit);
    this.earthOrbit.geometry.dispose(); this.earthOrbit = makeCircle(this.profile.earthOrbit, 0x4466aa, 256); this.scene.add(this.earthOrbit);
    this.moonOrbit.geometry.dispose(); this.moonOrbit = makeInclinedCircle(this.profile.moonOrbit, this.profile.moonOrbitInclination, 0x886644, 256); this.scene.add(this.moonOrbit);

    // Observer marker/beam sized to new Earth.
    this.observerMarker.geometry.dispose();
    this.observerMarker.geometry = new THREE.SphereGeometry(this.profile.earthRadius * 0.06, 12, 12);
    this.observerBeam.geometry.dispose();
    this.observerBeam.geometry = new THREE.CylinderGeometry(this.profile.earthRadius * 0.01, this.profile.earthRadius * 0.01, this.profile.earthRadius * 0.5, 8);

    this.controls.maxDistance = this.profile.realistic ? 200000 : 80000;
  }

  // -------------------------------------------------------------------------
  // Toggles
  // -------------------------------------------------------------------------
  toggleOrbits(v) { this.showOrbits = v; }
  toggleLabels(v) { this.showLabels = v; this.updateLabelVisibility(); }
  toggleBorders(v) { this.showBorders = v; }
  toggleMoonLock(v) { this.showMoonLock = v; }
  toggleRays(v) { this.showRays = v; }
  toggleLines(v) { this.showLines = v; }
  updateLabelVisibility() {
    for (const k in this.labels) this.labels[k].visible = this.showLabels;
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  }
}

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------
function makeLabel(text) {
  const div = document.createElement("div");
  div.className = "sme-label";
  div.textContent = text;
  return new CSS2DObject(div);
}

function makeStars() {
  const g = new THREE.BufferGeometry();
  const N = 4000;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 60000 * (0.5 + Math.random() * 0.5);
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(p) * Math.cos(t);
    pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
    pos[i * 3 + 2] = r * Math.cos(p);
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 60, sizeAttenuation: true, transparent: true, opacity: 0.85 });
  return new THREE.Points(g, m);
}

function makeCircle(radius, color, segments) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }));
}

function makeInclinedCircle(radius, inclDeg, color, segments) {
  const i = (inclDeg * Math.PI) / 180;
  const pts = [];
  for (let k = 0; k <= segments; k++) {
    const a = (k / segments) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z0 = Math.sin(a) * radius;
    // rotate about X by inclination
    pts.push(new THREE.Vector3(x, -Math.sin(i) * z0, Math.cos(i) * z0));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }));
}

function makeLine(color) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.65 }));
}
function makeDashedLine(color) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]);
  const m = new THREE.LineDashedMaterial({ color, dashSize: 1.5, gapSize: 1.5, transparent: true, opacity: 0.6 });
  const l = new THREE.Line(geo, m);
  l.computeLineDistances();
  return l;
}
function setLine(line, a, b) {
  const pos = line.geometry.attributes.position;
  pos.setXYZ(0, a.x, a.y, a.z);
  pos.setXYZ(1, b.x, b.y, b.z);
  pos.needsUpdate = true;
  if (line.computeLineDistances) line.computeLineDistances();
}
function dir(a, b) { return norm(sub(b, a)); }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function mul(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function norm(a) { const m = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / m, y: a.y / m, z: a.z / m }; }

function disposeObject(obj) {
  obj.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      mats.forEach((m) => {
        // Dispose any disposable sub-resources, but NOT textures (they are
        // shared across scale switches and reused). Use a typeof guard so we
        // never call a non-function.
        for (const k in m) {
          const v = m[k];
          if (v && typeof v.dispose === "function" && !(v.isTexture)) {
            try { v.dispose(); } catch (_) { /* ignore */ }
          }
        }
        m.dispose();
      });
    }
  });
}
