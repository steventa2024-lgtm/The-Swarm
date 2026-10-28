const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
let playwright;
for (const location of [process.env.SWARM_PLAYWRIGHT_PATH, 'playwright', 'C:/Users/steve/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'].filter(Boolean)) {
  try { playwright = require(location); break; } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
}
if (!playwright) throw new Error('Set SWARM_PLAYWRIGHT_PATH to an installed Playwright package');
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const sizes = [[1440,900,1],[1920,1080,1],[1536,864,1.25],[1024,768,1]];
(async () => {
  const browser = await playwright.chromium.launch({channel:'msedge',headless:true,args});
  const results = [];
  try {
    await fs.mkdir('artifacts/hardlight', {recursive:true});
    for (const [width,height,deviceScaleFactor] of sizes) {
      const context = await browser.newContext({viewport:{width,height},deviceScaleFactor,reducedMotion:'no-preference'});
      await context.route('**/*', route => { const url = new URL(route.request().url()); return ['127.0.0.1','localhost'].includes(url.hostname) && url.port==='1421' ? route.continue() : route.abort(); });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:1421/', {waitUntil:'networkidle'});
      await page.getByRole('heading',{name:'Mission control.',exact:true}).waitFor();
      const roster = page.locator('[aria-label="Eight Hardlight Familiars"]');
      await page.waitForFunction(() => window.__familiarViews?.size===8);
      assert.equal(await roster.locator('button').count(),8,'Eight familiar identities missing');
      assert.equal(await roster.locator('[data-renderer="three"]').count(),8,'Roster must use eight real 3D views');
      assert.equal(await roster.locator('img').count(),0,'Roster must not substitute floating portraits for 3D');
      assert.equal(await page.locator('canvas').count(),1,'Roster must share a single WebGL canvas');
      const png = await page.screenshot({path:`artifacts/hardlight/dashboard-${width}x${height}.png`});
      assert.equal(png.readUInt32BE(16),Math.round(width*deviceScaleFactor),'Actual screenshot scale does not match requested browser DPR');
      await page.getByRole('button',{name:'Model Control',exact:true}).click();
      await page.getByRole('heading',{name:'Model Control Center',exact:true}).waitFor();
      await page.getByLabel('Task call cap',{exact:true}).fill('4');
      assert.equal(await page.getByLabel('Task call cap',{exact:true}).inputValue(),'4');
      await page.screenshot({path:`artifacts/hardlight/models-${width}x${height}.png`});
      await page.getByRole('button',{name:'Mascot Studio',exact:true}).click();
      await page.getByRole('heading',{name:'Hardlight Familiars',exact:true}).waitFor();
      await page.getByLabel('Preview familiar',{exact:true}).selectOption('codex');
      await page.getByLabel('Preview state',{exact:true}).selectOption('working');
      await page.waitForFunction(() => !!window.__familiar3d?.scene.getObjectByName('codex-articulated-wolf'));
      assert.equal(await page.locator('canvas').count(),1,'Studio must render one real scene');
      assert.equal(await page.getByLabel('Preview familiar',{exact:true}).locator('option').count(),8);
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.waitForFunction(() => document.querySelector('.familiar-3d-stage')?.dataset.motion==='off');
      await page.screenshot({path:`artifacts/hardlight/gallery-${width}x${height}.png`});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth>innerWidth+1),false,'Horizontal document clipping');
      assert.deepEqual(errors,[],'Browser runtime errors');
      results.push({width,height,deviceScaleFactor,screenshotWidth:png.readUInt32BE(16),actual3DViews:8,sharedCanvases:1});
      await context.close();
    }
    await fs.writeFile('artifacts/hardlight/responsive-3d-acceptance.json',JSON.stringify({passed:true,softwareWebGL:true,browserArgs:args,results,limits:'Headless Edge with SwiftShader. Browser DPR 1.25 is tested; native Windows DPI and macOS are not claimed. No provider calls or owner actions.'},null,2));
    console.log('Hardlight responsive UI passed: eight real 3D views / one shared canvas, preview controls, model cap input, reduced motion, four viewports including actual browser deviceScaleFactor 1.25. Software WebGL only; no live provider or approval actions.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
