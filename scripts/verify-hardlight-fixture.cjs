const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {chromium}=require(process.env.SWARM_PLAYWRIGHT_PATH||'playwright');
(async()=>{
 const dir=path.resolve(process.argv[2]||'artifacts/hardlight/fixture-review');
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8'),readme=fs.readFileSync(path.join(dir,'README.md'),'utf8');
 assert(html.trim().split(/\r?\n/).length<15,'HTML exceeds task bound');assert(readme.trim().split(/\r?\n/).length<15,'README exceeds task bound');
 assert(!/<script|https?:\/\/|\b(?:src|href)\s*=/i.test(html),'Fixture must remain offline and script-free');
 assert(/\bZero\b/.test(readme),'README must name Zero as final approver');
 assert(!/only a file.s owner|agents? (?:can|may) apply/i.test(readme),'README confuses file ownership with approval authority');
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({javaScriptEnabled:false,viewport:{width:1080,height:720}});
 await page.goto(require('node:url').pathToFileURL(path.join(dir,'index.html')).href);
 assert.equal(await page.title(),'Swarm Evidence');assert.equal(await page.locator('h1').innerText(),'Awaiting Zero');assert.match(await page.locator('body').innerText(),/No files applied/);
 await page.screenshot({path:path.join(dir,'fixture-preview.png')});await browser.close();
 const result={verifiedAt:new Date().toISOString(),checks:['Two reviewed proposal files exist','Both files under 15 lines','No script/network dependencies','Zero explicitly owns final approval','Semantic heading and title render','Unapplied status shown'],passed:6,applied:false};
 fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exit(1)});
