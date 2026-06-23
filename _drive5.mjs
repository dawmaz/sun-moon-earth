import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new",
  args: ["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"] });
const page = await browser.newPage();
await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
await page.goto("http://127.0.0.1:8765/index.html",{waitUntil:"networkidle0",timeout:60000});
await new Promise(r=>setTimeout(r,3000));
await page.screenshot({path:"_shots/01-space.png"});
// Full moon date
await page.evaluate(()=>{ document.getElementById("datetime").value="2024-01-25T12:00"; document.getElementById("datetime").dispatchEvent(new Event("input",{bubbles:true})); });
await new Promise(r=>setTimeout(r,800));
await page.screenshot({path:"_shots/02-fullmoon-space.png"});
// Moon close-up
await page.click("#moon");
await new Promise(r=>setTimeout(r,600));
await page.screenshot({path:"_shots/03-moon-closeup.png"});
// First quarter
await page.evaluate(()=>{ document.getElementById("datetime").value="2024-01-18T12:00"; document.getElementById("datetime").dispatchEvent(new Event("input",{bubbles:true})); });
await new Promise(r=>setTimeout(r,700));
await page.click("#moon");
await new Promise(r=>setTimeout(r,600));
await page.screenshot({path:"_shots/04-firstquarter-moon.png"});
// Top view
await page.click("#top");
await new Promise(r=>setTimeout(r,500));
await page.screenshot({path:"_shots/05-top.png"});
console.log("shots done");
await browser.close();
