import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new",
  args: ["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"] });
const page = await browser.newPage();
const errs = [];
page.on("pageerror",(e)=>errs.push("page:"+e.message));
page.on("console",(m)=>{ if(m.type()==="error") errs.push("console:"+m.text()); });
await page.goto("http://127.0.0.1:8765/index.html",{waitUntil:"networkidle0",timeout:60000});
await new Promise(r=>setTimeout(r,2500));
let r = await page.evaluate(()=>({scaleNote:document.getElementById("scaleNote").textContent, phase:document.getElementById("phaseName").textContent, illum:document.getElementById("phaseIllum").textContent}));
console.log("Boot:", JSON.stringify(r));
for (const s of ["realistic","educational","realistic","educational"]) {
  await page.click(`input[name="scale"][value="${s}"]`);
  await new Promise(r=>setTimeout(r,800));
}
r = await page.evaluate(()=>({scaleNote:document.getElementById("scaleNote").textContent, phase:document.getElementById("phaseName").textContent, illum:document.getElementById("phaseIllum").textContent}));
console.log("After scale cycling:", JSON.stringify(r));
for (const p of ["space","earth","top","moon","alignment","observer","resetCam"]) {
  await page.click("#"+p); await new Promise(r=>setTimeout(r,200));
}
for (const t of ["tOrbits","tLabels","tRays","tLines"]) {
  await page.click("#"+t); await page.click("#"+t);
}
await page.click("#play"); await new Promise(r=>setTimeout(r,300)); await page.click("#play");
await page.evaluate(()=>{ const el=document.getElementById("speed"); el.value="2"; el.dispatchEvent(new Event("input",{bubbles:true})); });
await page.click("#stepFwd"); await page.click("#stepBack"); await page.click("#now");
console.log("pageerrors/console-errors:", errs.length, JSON.stringify(errs.slice(0,5)));
await browser.close();
