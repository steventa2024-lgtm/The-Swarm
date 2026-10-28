const { chromium } = require(process.env.SWARM_PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs/promises');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await fs.mkdir('artifacts/hardlight', { recursive: true });
  for (const [width, height] of [[1440,900],[1920,1080],[1536,864],[1024,768]]) {
    await page.setViewportSize({width,height});
    await page.goto('http://127.0.0.1:1421', {waitUntil:'networkidle'});
    await page.getByRole('heading',{name:'Mission control.'}).waitFor();
    if(await page.locator('[aria-label="Eight Hardlight Familiars"] button').count() !== 8) throw Error('Missing familiar identity');
    await page.locator('[aria-label="Eight Hardlight Familiars"] img').first().evaluate(img => img.decode());
    await page.screenshot({path:`artifacts/hardlight/dashboard-${width}x${height}.png`});
    await page.getByRole('button',{name:'Model Control',exact:true}).click();
    await page.getByRole('heading',{name:'Model Control Center',exact:true}).waitFor();
    await page.getByLabel('Task call cap',{exact:true}).fill('4');
    if(await page.getByLabel('Task call cap',{exact:true}).inputValue() !== '4') throw Error('Model guard edit did not persist');
    await page.screenshot({path:`artifacts/hardlight/models-${width}x${height}.png`});
    await page.getByRole('button',{name:'Mascot Studio',exact:true}).click();
    await page.getByRole('heading',{name:'Hardlight Familiars',exact:true}).waitFor();
    await page.getByLabel('Preview state',{exact:true}).selectOption('working');
    const art = page.locator('.agent-mascot img');
    for (const img of await art.all()) if(!await img.evaluate(async i => {await i.decode();return i.naturalWidth>0})) throw Error('Artwork missing');
    await page.emulateMedia({reducedMotion:'reduce'});
    if(await art.first().evaluate(i=>getComputedStyle(i).animationName) !== 'none') throw Error('Reduced motion ignored');
    await page.screenshot({path:`artifacts/hardlight/gallery-${width}x${height}.png`});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)) throw Error('Horizontal document clipping');
    await page.emulateMedia({reducedMotion:'no-preference'});
  }
  if(errors.length) throw Error(errors.join('\n'));
  await browser.close();
  console.log('Hardlight UI verified: eight assets; model cap persistence; preview states; reduced motion; 1440x900, 1920x1080, 1536x864 (125% equivalent CSS area), 1024x768. Browser screenshots are local UI evidence, not live provider evidence.');
})().catch(e=>{console.error(e);process.exit(1)});
