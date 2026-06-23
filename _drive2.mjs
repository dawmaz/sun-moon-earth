import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new",
  args: ["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"] });
const page = await browser.newPage();
const errs = [];
page.on("pageerror",(e)=>errs.push(e.message));
await page.goto("http://127.0.0.1:8765/index.html",{waitUntil:"networkidle0",timeout:60000});
await new Promise(r=>setTimeout(r,2500));
const read = ()=>page.evaluate(()=>({
  phase: document.getElementById("phaseName").textContent,
  illum: document.getElementById("phaseIllum").textContent,
  age: document.getElementById("phaseAge").textContent,
}));
console.log("NOW:", JSON.stringify(await read()));
// Set date to a known full moon (2024-01-25) via the datetime input.
await page.evaluate(()=>{ document.getElementById("datetime").value = "2024-01-25T12:00"; 
  document.getElementById("datetime").dispatchEvent(new Event("input",{bubbles:true})); });
await new Promise(r=>setTimeout(r,400));
console.log("2024-01-25 (full moon):", JSON.stringify(await read()));
await page.evaluate(()=>{ document.getElementById("datetime").value = "2024-01-11T12:00";
  document.getElementById("datetime").dispatchEvent(new Event("input",{bubbles:true})); });
await new Promise(r=>setTimeout(r,400));
console.log("2024-01-11 (new moon):", JSON.stringify(await read()));
// Test a location change to Sydney
await page.select("#location","sydney");
await new Promise(r=>setTimeout(r,300));
console.log("Sydney moonSky:", document.getElementById("moonSky") && await page.evaluate(()=>document.getElementById("moonSky").textContent));
// Click observer preset
await page.click("#observer");
await new Promise(r=>setTimeout(r,400));
const cam = await page.evaluate(()=>{ const c=document.querySelector("canvas"); return c?"ok":"no canvas"; });
console.log("observer preset click ok, pageerrors:", errs.length, errs.slice(0,3));
await browser.close();
