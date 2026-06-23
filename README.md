# Sun · Earth · Moon

A self-contained browser visualization showing how Sun–Earth–Moon geometry creates lunar phases.

## Run locally

The application uses ES modules, so serve the directory over HTTP rather than opening `index.html` directly:

```sh
npm start
```

Then open <http://localhost:4173>. No installation, build step, runtime API, or network connection is required. Run the calculation tests with:

```sh
npm test
```

## Simulation model

- The Sun uses a low-precision solar ephemeris based on standard Meeus formulas.
- The Moon uses its mean orbital elements plus the largest periodic longitude, latitude, and distance terms. Its position is intended to be accurate to roughly 1–2 degrees, not for navigation or eclipse prediction.
- Earth rotation uses Greenwich mean sidereal time. Observer altitude and azimuth are calculated from the selected location's local sidereal angle.
- Moon phase and illuminated fraction come from the Sun–Earth–Moon vectors. The 3D Moon is a lit sphere; phase images are never swapped in.
- The Moon rotates synchronously: its orientation turns once per orbit so lunar longitude 0° remains directed toward Earth. The optional cyan near-side marker makes this otherwise subtle rotation visible. The model does not integrate N-body gravity, libration, precession, nutation, atmospheric refraction, terrain, or topocentric parallax.

## Scale modes

Educational scale exaggerates body sizes and the Earth–Moon distance so all three bodies remain inspectable. This slightly changes the rendered lighting angle (by at most a few degrees), while the displayed phase calculation uses astronomical directions.

Realistic scale preserves the ratios between radii, the mean Earth–Moon distance, and one astronomical unit. It is intentionally difficult to view at once.

Orbit helper lines are explanatory: Earth's helper is circular and the Moon helper uses a fixed 5.145° inclined circle. Calculated body positions include Earth's orbital eccentricity and the main lunar perturbations.

## Textures and lighting

The bundled Earth day texture is NASA Blue Marble Next Generation imagery. The night texture is NASA's global DMSP city-lights map. Country lines are rendered from the Natural Earth 1:50m Admin-0 boundary dataset and can be toggled independently. Boundaries represent Natural Earth's de facto cartographic dataset and should not be interpreted as a political statement.

The Moon uses NASA Scientific Visualization Studio's LRO color mosaic and LOLA elevation map. The elevation texture drives material bump mapping, making mapped craters and terrain react to sunlight instead of relying only on painted shading.

All files are stored under `assets/`; no texture is downloaded at runtime. Procedural generation in `src/textures.js` remains as an offline fallback if an asset is missing. The Sun and cloud layer are procedural.

Texture/data credits:

- Earth: NASA Earth Observatory, Blue Marble Next Generation; Reto Stöckli.
- Night lights: NASA GSFC/NOAA DMSP OLS; Marc Imhoff, Christopher Elvidge, Craig Mayhew, and Robert Simmon.
- Moon: NASA Scientific Visualization Studio; LRO Camera and LOLA teams.
- Boundaries: Natural Earth, public-domain map data.

The Sun is the primary Three.js point light. A small ambient term keeps unlit surfaces readable; inverse-square falloff and cast shadows are omitted because they add little to the phase demonstration and perform poorly across the two scale modes.
