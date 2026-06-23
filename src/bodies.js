// bodies.js
// Construction of the Sun, Earth, and Moon meshes.
//
// Lighting model (the crux of the Moon phase):
//   * The Sun is a single PointLight at the origin (the heliocenter). It does
//     NOT decay with distance, so Earth and the Moon both receive the same
//     solar flux — this is an educational simplification (real flux follows
//     1/r², but the Sun–Earth and Sun–Moon distances are nearly equal, so it is
//     physically reasonable here).
//   * The Moon is a plain lit sphere (MeshStandardMaterial). Its illuminated
//     hemisphere always faces the Sun. Which part of that lit hemisphere an
//     observer sees depends only on the Sun–Earth–Moon geometry — so the phase
//     is produced by real 3D lighting, never by swapping a phase image.
//   * The Moon is tidally locked: the same hemisphere faces Earth, as in nature.

import * as THREE from "../lib/three/three.module.js";
import { OBLIQUITY_DEG } from "./constants.js";

const EPS = (OBLIQUITY_DEG * Math.PI) / 180;

// ---------------------------------------------------------------------------
// Sun
// ---------------------------------------------------------------------------
export function createSun(profile, textures) {
  const geo = new THREE.SphereGeometry(profile.sunRadius, 64, 64);
  const mat = new THREE.MeshBasicMaterial({
    map: textures.sun,
    color: 0xffd9a0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "Sun";

  // Light source for the whole system.
  const light = new THREE.PointLight(0xfff2d8, 4.0, 0, 0); // decay = 0 (no falloff)
  mesh.add(light);

  // Glow sprite (additive, always faces camera).
  const glowTex = textures.glow;
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(profile.sunRadius * 6);
  mesh.add(glow);

  // A dimmer outer corona.
  const corona = new THREE.Sprite(glowMat.clone());
  corona.scale.setScalar(profile.sunRadius * 14);
  corona.material.opacity = 0.35;
  mesh.add(corona);

  return {
    object: mesh,
    light,
    update(_state, dt) {
      mesh.rotation.y += dt * 0.02; // slow surface drift for life
    },
  };
}

// ---------------------------------------------------------------------------
// Earth — custom day/night shader so the terminator and city lights are real.
// ---------------------------------------------------------------------------
const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const earthFragment = /* glsl */ `
  uniform sampler2D dayTex;
  uniform sampler2D nightTex;
  uniform vec3 sunDir; // world-space direction from Earth centre toward the Sun
  uniform float ambient;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    float ndotl = dot(normalize(vWorldNormal), normalize(sunDir));
    float diff = max(ndotl, 0.0);
    vec3 day = texture2D(dayTex, vUv).rgb * (ambient + (1.0 - ambient) * diff);
    vec3 night = texture2D(nightTex, vUv).rgb; // emissive city lights on dark side
    float dayMix = smoothstep(-0.18, 0.22, ndotl);
    vec3 col = mix(night, day, dayMix);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createEarth(profile, textures) {
  const geo = new THREE.SphereGeometry(profile.earthRadius, 96, 96);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      dayTex: { value: textures.day },
      nightTex: { value: textures.night },
      sunDir: { value: new THREE.Vector3(1, 0, 0) },
      ambient: { value: 0.06 },
    },
    vertexShader: earthVertex,
    fragmentShader: earthFragment,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "Earth";

  // Natural Earth country boundaries sit just above the terrain texture.
  // They share Earth's geographic frame and rotation, so the observer marker
  // lands on the correct country as sidereal time advances.
  const borders = textures.borders
    ? createCountryBorders(profile.earthRadius * 1.006, textures.borders)
    : null;
  if (borders) mesh.add(borders);

  // Axial tilt in scene coordinates. Local +Y is Earth's north pole; rotating
  // the parent around scene X places it at (0, cos ε, -sin ε), matching the
  // equatorial/ecliptic conversion used by observer.js.
  const group = new THREE.Group();
  group.rotation.x = -EPS;
  group.add(mesh);

  // Clouds: separate slightly-larger transparent sphere, lit by the Sun light.
  const cloudGeo = new THREE.SphereGeometry(profile.earthRadius * 1.012, 64, 64);
  const cloudMat = new THREE.MeshStandardMaterial({
    map: textures.clouds,
    transparent: true,
    alphaTest: 0.0,
    depthWrite: false,
    roughness: 1.0,
    metalness: 0.0,
  });
  const clouds = new THREE.Mesh(cloudGeo, cloudMat);
  group.add(clouds);

  // Atmosphere rim glow (additive backside).
  const atmoGeo = new THREE.SphereGeometry(profile.earthRadius * 1.06, 64, 64);
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: `
      varying vec3 vN; varying vec3 vWorldNormal;
      void main(){
        vN = normalize(normalMatrix * normal);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: `
      uniform vec3 sunDir; varying vec3 vN; varying vec3 vWorldNormal;
      void main(){
        float rim = pow(1.0 - max(dot(vN, vec3(0.0,0.0,1.0)), 0.0), 3.0);
        float lit = max(dot(normalize(vWorldNormal), normalize(sunDir)), 0.0);
        gl_FragColor = vec4(vec3(0.35,0.6,1.0), rim * (0.25 + 0.75*lit));
      }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const atmo = new THREE.Mesh(atmoGeo, atmoMat);
  group.add(atmo);

  // Accumulated spin (radians) so time animation can advance continuously.
  let spin = 0;
  let lastJD = null;

  return {
    object: group,
    mesh,
    clouds,
    borders,
    atmosphere: atmo,
    update(state, dt, isPlaying) {
      // Position Earth at its heliocentric location.
      group.position.set(state.earth.scenePos.x, state.earth.scenePos.y, state.earth.scenePos.z);
      // Sun direction (world) = from Earth toward Sun (origin).
      const sd = new THREE.Vector3(
        -state.earth.scenePos.x,
        -state.earth.scenePos.y,
        -state.earth.scenePos.z
      ).normalize();
      mat.uniforms.sunDir.value.copy(sd);
      atmoMat.uniforms.sunDir.value.copy(sd);

      // Earth rotation: map GMST to a spin angle about the tilted axis. GMST
      // advances ~360°/sidereal day; we set the mesh spin so Greenwich tracks
      // sidereal time (consistent with the observer geometry in observer.js).
      // We integrate continuously when animating to keep motion smooth, and
      // snap to GMST when scrubbing/jumping in time.
      if (isPlaying && lastJD !== null) {
        const dDays = state.jd - lastJD;
        spin += dDays * Math.PI * 2 / (23.9344696 / 24.0); // sidereal-day rate
      } else {
        spin = (state.gmstDeg * Math.PI) / 180;
      }
      lastJD = state.jd;
      mesh.rotation.y = spin;
      clouds.rotation.y = spin + state.jd * 0.02; // small eastward cloud drift
    },
  };
}

// ---------------------------------------------------------------------------
// Moon — plain lit sphere. Tidally locked to Earth.
// ---------------------------------------------------------------------------
export function createMoon(profile, textures) {
  const geo = new THREE.SphereGeometry(profile.moonRadius, 64, 64);
  const mat = new THREE.MeshStandardMaterial({
    map: textures.color || textures,
    bumpMap: textures.bump || null,
    bumpScale: profile.moonRadius * 0.012,
    roughness: 0.97,
    metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "Moon";

  // Educational tidal-lock helper. It is attached to lunar longitude 0°
  // (the centre of the real near-side map), so it rotates with the Moon and
  // continuously points toward Earth during synchronous rotation.
  const lockHelper = new THREE.Group();
  lockHelper.name = "Moon near-side / synchronous-rotation helper";
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(profile.moonRadius * 0.055, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x66ffff, depthTest: true })
  );
  marker.position.set(profile.moonRadius * 1.035, 0, 0);
  lockHelper.add(marker);

  const meridianPoints = [];
  for (let latitude = -88; latitude <= 88; latitude += 2) {
    const a = latitude * Math.PI / 180;
    meridianPoints.push(new THREE.Vector3(
      profile.moonRadius * 1.008 * Math.cos(a),
      profile.moonRadius * 1.008 * Math.sin(a),
      0
    ));
  }
  const meridian = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(meridianPoints),
    new THREE.LineBasicMaterial({ color: 0x66ffff, transparent: true, opacity: 0.8 })
  );
  lockHelper.add(meridian);
  mesh.add(lockHelper);

  // The Moon's orbit is inclined to the ecliptic; the orbital plane is handled
  // by the position we compute (it already includes ecliptic latitude). We use
  // a group placed at Earth so Moon positions are relative to Earth.
  const group = new THREE.Group();
  group.add(mesh);

  return {
    object: group,
    mesh,
    lockHelper,
    update(state) {
      group.position.set(state.earth.scenePos.x, state.earth.scenePos.y, state.earth.scenePos.z);
      mesh.position.set(
        state.moon.relEarth.x,
        state.moon.relEarth.y,
        state.moon.relEarth.z
      );
      // Tidal lock: keep one face toward Earth.
      mesh.lookAt(state.earth.scenePos.x, state.earth.scenePos.y, state.earth.scenePos.z);
      // The LRO map is centered on lunar longitude 0° at local +X, while
      // Object3D.lookAt points local +Z at the target. Rotate +X onto +Z so the
      // real lunar near side faces Earth.
      mesh.rotateY(-Math.PI / 2);
    },
  };
}

// Convert Natural Earth lon/lat polylines into one efficient line-segment mesh.
// Standard SphereGeometry UVs put east-positive longitude toward local -Z,
// matching the scene's right-handed astronomical frame.
function createCountryBorders(radius, geojson) {
  const positions = [];
  const addLine = (coordinates) => {
    for (let i = 1; i < coordinates.length; i++) {
      const a = coordinates[i - 1], b = coordinates[i];
      // Do not draw a chord through the globe when a line wraps at ±180°.
      if (Math.abs(a[0] - b[0]) > 180) continue;
      positions.push(...lonLatPoint(a[0], a[1], radius));
      positions.push(...lonLatPoint(b[0], b[1], radius));
    }
  };

  for (const feature of geojson.features || []) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    if (geometry.type === "LineString") addLine(geometry.coordinates);
    if (geometry.type === "MultiLineString") geometry.coordinates.forEach(addLine);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x9fd9ff,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = "Country borders (Natural Earth)";
  lines.renderOrder = 2;
  return lines;
}

function lonLatPoint(lonDeg, latDeg, radius) {
  const lon = lonDeg * Math.PI / 180;
  const lat = latDeg * Math.PI / 180;
  const c = Math.cos(lat);
  return [radius * c * Math.cos(lon), radius * Math.sin(lat), -radius * c * Math.sin(lon)];
}
