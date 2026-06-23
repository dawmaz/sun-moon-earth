import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new",
  args: ["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"] });
const page = await browser.newPage();
const errs = [];
page.on("pageerror",(e)=>errs.push(e.message));
page.on("console",(m)=>{ if(m.type()==="error") errs.push("console:"+m.text()); });
await page.goto("http://127.0.0.1:8765/index.html",{waitUntil:"networkidle0",timeout:60000});
await new Promise(r=>setTimeout(r,2500));
await page.select("#location","sydney");
await new Promise(r=>setTimeout(r,300));
let r = await page.evaluate(()=>({moonSky:document.getElementById("moonSky").textContent, obs:document.getElementById("obsName").textContent}));
console.log("Sydney:", JSON.stringify(r));
await page.select("#location","warsaw");
await new Promise(r=>setTimeout(r,300));
r = await page.evaluate(()=>({moonSky:document.getElementById("moonSky").textContent, obs:document.getElementById("obsName").textContent}));
console.log("Warsaw:", JSON.stringify(r));
await page.click('input[name="scale"][value="realistic"]');
await new Promise(r=>setTimeout(r,1500));
r = await page.evaluate(()=>({scaleNote:document.getElementById("scaleNote").textContent, phase:document.getElementById("phaseName").textContent, illum:document.getElementById("phaseIllum").textContent}));
console.log("Realistic scale:", JSON.stringify(r));
await page.click('input[name="scale"][value="educational"]');
await new Promise(r=>setTimeout(r,1200));
for (const p of ["space","earth","top","moon","alignment","observer"]) {
  await page.click("#"+p); await new Promise(r=>setTimeout(r,250));
}
for (const t of ["tOrbits","tLabels","tRays","tLines"]) {
  await page.click("#"+t); await page.click("#"+t);
}
console.log("pageerrors/console-errors:", errs.length, errs.slice(0,5));
await browser.close();
