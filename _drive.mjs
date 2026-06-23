import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage();
const consoleMsgs = [];
page.on("console", (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consoleMsgs.push(`[pageerror] ${e.message}`));

await page.goto("http://127.0.0.1:8765/index.html", { waitUntil: "networkidle0", timeout: 60000 });
// Give textures/RAF time.
await new Promise((r) => setTimeout(r, 3000));

const data = await page.evaluate(() => {
  const get = (id) => document.getElementById(id)?.textContent ?? null;
  return {
    phaseName: get("phaseName"),
    phaseIllum: get("phaseIllum"),
    phaseAge: get("phaseAge"),
    sunSky: get("sunSky"),
    moonSky: get("moonSky"),
    loadingVisible: document.getElementById("loading").style.display !== "none",
    canvasW: document.querySelector("canvas")?.width ?? null,
  };
});
console.log("=== PANEL DATA ===");
console.log(JSON.stringify(data, null, 2));
console.log("=== CONSOLE (first 25) ===");
console.log(consoleMsgs.slice(0, 25).join("\n"));

const diag = await page.evaluate(async () => {
  const d = window.__diag;
  if (!d) return { err: "no __diag" };
  const s = d.computeState(d.getSim(), d.getScene().profile, d.scaleFns);
  return {
    phaseName: s.phaseName,
    illum: s.illuminatedFraction,
    elong: s.elongation,
    phaseAngle: s.phaseAngle,
    moonDistKm: s.moon.distanceKm,
    earthDistAU: s.earth.distAU,
    profile: d.getScene().profile.realistic ? "realistic" : "educational",
    earthOrbit: d.getScene().profile.earthOrbit,
    moonOrbit: d.getScene().profile.moonOrbit,
    earthPos: s.earth.scenePos,
    moonRel: s.moon.relEarth,
    earthToSun: s.earthToSun,
    earthToMoon: s.earthToMoon,
    dotES_EM: s.earthToSun.x * s.earthToMoon.x + s.earthToSun.y * s.earthToMoon.y + s.earthToSun.z * s.earthToMoon.z,
  };
});
console.log("=== DIAG ===");
console.log(JSON.stringify(diag, null, 2));
await browser.close();
