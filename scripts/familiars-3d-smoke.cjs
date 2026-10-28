/* Real Stage B acceptance. An isolated browser uses software WebGL; no model inference,
 * Telegram action, native approval, or production state injection is performed. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
let playwright;
for (const location of [process.env.SWARM_PLAYWRIGHT_PATH, 'playwright', 'C:/Users/steve/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'].filter(Boolean)) { try { playwright=require(location);break; } catch(error) {if(error.code!=='MODULE_NOT_FOUND')throw error;} }
if(!playwright)throw Error('Set SWARM_PLAYWRIGHT_PATH to an installed Playwright package');
const IDS=['hq','codex','claude','gemini','cursor','grok','deepseek','ollama'];
const ROOT=id=>id==='codex'?'codex-articulated-wolf':`familiar-${id}`;
const args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
const report={passed:false,softwareWebGL:true,browserArgs:args,limits:'Headless Microsoft Edge / SwiftShader software rendering. No hardware FPS, native Windows DPI, or macOS result is claimed.',models:[],navigation:[],screenshots:[]};
let browser;
async function pause(page,ms=650){await page.waitForTimeout(ms)}
async function modelSnapshot(page,id,scope='studio'){
 return page.evaluate(({id,rootName,scope})=>{
  const entry=scope==='studio'?window.__familiar3d:window.__familiarViews?.get(id);
  const root=entry?.scene.getObjectByName(rootName);if(!root)throw Error(`Actual ${id} root unavailable in ${scope}`);
  root.updateWorldMatrix(true,true);let meshes=0;const maps=[],planes=[],joints={},min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  root.traverse(n=>{
   if(n!==root&&n.name&&(n.isGroup||n.isBone))joints[n.name]=[...n.position.toArray(),...n.quaternion.toArray(),...n.scale.toArray(),Number(n.visible)];
   if(!n.isMesh)return;meshes++;if(/^Plane(?:Buffer)?Geometry$/.test(n.geometry.type))planes.push(n.name||n.uuid);
   for(const m of Array.isArray(n.material)?n.material:[n.material])for(const key of Object.keys(m))if(m[key]?.isTexture)maps.push(key);
   n.geometry.computeBoundingBox();const box=n.geometry.boundingBox;if(!box)return;
   for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const p=box.min.clone().set(x,y,z).applyMatrix4(n.matrixWorld).toArray();p.forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v)})
   }
  });
  const context=entry.gl.getContext(),debug=context.getExtension('WEBGL_debug_renderer_info');
  return {id,meshes,maps,planes,joints,bounds:max.map((v,i)=>v-min[i]),camera:{position:entry.camera.position.toArray(),quaternion:entry.camera.quaternion.toArray()},renderer:debug?context.getParameter(debug.UNMASKED_RENDERER_WEBGL):context.getParameter(context.RENDERER)};
 },{id,rootName:ROOT(id),scope});
}
function changes(a,b,tolerance=1e-6){return Object.keys(a.joints).filter(name=>b.joints[name]&&a.joints[name].some((v,i)=>Math.abs(v-b.joints[name][i])>tolerance))}
function maximumDelta(a,b){return Math.max(0,...Object.keys(a.joints).flatMap(name=>a.joints[name].map((v,i)=>Math.abs(v-b.joints[name][i]))))}
async function waitStudio(page,id){await page.waitForFunction(root=>!!window.__familiar3d?.scene.getObjectByName(root),ROOT(id),{timeout:30000});await page.locator('.familiar-3d-stage').scrollIntoViewIfNeeded();await pause(page);}
async function waitRoster(page){await page.getByRole('heading',{name:'Mission control.',exact:true}).waitFor();await page.waitForFunction(ids=>ids.every(id=>window.__familiarViews?.get(id)?.scene.getObjectByName(id==='codex'?'codex-articulated-wolf':`familiar-${id}`)),IDS,{timeout:30000});await pause(page,900);}
async function restrict(context){await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)&&u.port==='1421'?route.continue():route.abort()})}
(async()=>{
 await fs.mkdir('artifacts/3d',{recursive:true});
 browser=await playwright.chromium.launch({channel:'msedge',headless:true,args});
 const context=await browser.newContext({viewport:{width:1480,height:980},reducedMotion:'no-preference'});await restrict(context);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:1421/',{waitUntil:'domcontentloaded'});await waitRoster(page);
 assert.equal(await page.locator('canvas').count(),1,'Eight roster views need one shared renderer');
 for(const id of IDS){const model=await modelSnapshot(page,id,'roster');assert(model.meshes>15,`${id} roster is missing actual meshgeometry`)}
 await page.getByRole('button',{name:'Mascot Studio',exact:true}).click();
 await page.getByRole('heading',{name:'Hardlight Familiars',exact:true}).waitFor();
 await page.getByLabel('Visual quality',{exact:true}).selectOption('medium');
 for(const id of IDS){
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.getByLabel('Preview familiar',{exact:true}).selectOption(id);
  await page.getByLabel('Motion preference',{exact:true}).selectOption('full');
  await page.getByLabel('Preview state',{exact:true}).selectOption('idle');
  await page.getByRole('button',{name:'three quarter',exact:true}).click();await waitStudio(page,id);
  const a=await modelSnapshot(page,id);assert(a.meshes>15,`${id}: expected real meshes`);assert(a.bounds.every(v=>v>0.3),`${id}: missing depth ${a.bounds}`);assert.equal(a.maps.length,0,`${id}: mapped image`);assert.equal(a.planes.length,0,`${id}: portrait plane`);assert(Object.keys(a.joints).length>3,`${id}: articulated named hierarchy missing`);
  await pause(page,1150);const b=await modelSnapshot(page,id),idleChanged=changes(a,b);assert(idleChanged.length,`${id}: no actual nonroot idle joint movement`);
  await page.getByLabel('Preview state',{exact:true}).selectOption('working');await pause(page,700);const c=await modelSnapshot(page,id),stateChanged=changes(b,c);assert(stateChanged.length,`${id}: idle and working poses identical`);
  await pause(page,1150);const d=await modelSnapshot(page,id),workingChanged=changes(c,d);assert(workingChanged.length,`${id}: no working joint motion`);
  const screenshot=`artifacts/3d/all-${id}.png`;await page.locator('.familiar-3d-stage').screenshot({path:screenshot});report.screenshots.push(screenshot);
  await page.getByLabel('Motion preference',{exact:true}).selectOption('off');await pause(page);const offA=await modelSnapshot(page,id);
  await page.getByRole('button',{name:'front',exact:true}).click();await pause(page,950);const offB=await modelSnapshot(page,id),offDelta=maximumDelta(offA,offB);assert(offDelta<1e-8,`${id}: motion Off still changes joints ${offDelta}`);
  await page.getByLabel('Motion preference',{exact:true}).selectOption('full');await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('.familiar-3d-stage')?.dataset.motion==='off');await pause(page);const reducedA=await modelSnapshot(page,id);
  await page.getByRole('button',{name:'side',exact:true}).click();await pause(page,950);const reducedB=await modelSnapshot(page,id),reducedDelta=maximumDelta(reducedA,reducedB);assert(reducedDelta<1e-8,`${id}: reduced motion still changes joints ${reducedDelta}`);
  report.models.push({id,meshes:a.meshes,bounds:a.bounds,namedJoints:Object.keys(a.joints).length,idleChanged,stateChanged,workingChanged,offDelta,reducedDelta,renderer:a.renderer});console.log(`Verified ${id}: ${a.meshes} meshes, ${Object.keys(a.joints).length} joints, no image maps, Off/reduced frozen.`);
 }
 await page.evaluate(()=>window.__familiar3d.gl.forceContextLoss());await page.getByText('3D renderer unavailable',{exact:true}).waitFor();await page.getByText('Agent tasks and approval controls remain available. This is a labeled static reference fallback.',{exact:true}).waitFor();
 await page.locator('.familiar-3d-stage').screenshot({path:'artifacts/3d/all-studio-context-fallback.png'});report.studioContextFallback=true;
 await page.reload({waitUntil:'domcontentloaded'});await waitRoster(page);
 const sharedBefore=await page.evaluate(()=>({scene:window.__familiarViews.get('codex').scene.uuid,canvases:document.querySelectorAll('canvas').length,allShared:[...window.__familiarViews.values()].every(v=>v.gl===window.__familiarRenderer)}));assert(sharedBefore.allShared);assert.equal(sharedBefore.canvases,1);
 await page.locator('[aria-label="Eight Hardlight Familiars"] button').nth(1).click();const dialog=page.getByRole('dialog',{name:'Codex inspector',exact:true});await dialog.waitFor();await pause(page,600);
 const inspector=await page.evaluate(()=>({scene:window.__familiarViews.get('codex').scene.uuid,sameRenderer:window.__familiarViews.get('codex').gl===window.__familiarRenderer,canvases:document.querySelectorAll('canvas').length}));assert.notEqual(inspector.scene,sharedBefore.scene,'Inspector must use its expanded actual view');assert(inspector.sameRenderer,'Inspector opened a second GPU context');assert.equal(inspector.canvases,1);
 const cameraBefore=(await modelSnapshot(page,'codex','roster')).camera;
 const portrait=dialog.locator('.mascot-portrait');const box=await portrait.boundingBox();assert(box,'Expanded actual 3D view missing');
 await page.mouse.move(box.x+box.width*0.5,box.y+box.height*0.5);await page.mouse.down();await page.mouse.move(box.x+box.width*0.72,box.y+box.height*0.6,{steps:12});await page.mouse.up();await pause(page,700);
 const cameraAfter=(await modelSnapshot(page,'codex','roster')).camera;assert(cameraBefore.position.some((v,i)=>Math.abs(v-cameraAfter.position[i])>0.01),'Actual inspector orbit camera did not move');report.inspector={sharedContext:true,cameraBefore,cameraAfter};
 await dialog.screenshot({path:'artifacts/3d/shared-inspector-orbit.png'});await page.getByRole('button',{name:'Close agent inspector',exact:true}).click();
 for(let cycle=0;cycle<3;cycle++){
  await page.getByRole('button',{name:'Model Control',exact:true}).click();await page.getByRole('heading',{name:'Model Control Center',exact:true}).waitFor();
  await page.getByRole('button',{name:'Swarm',exact:true}).click();await waitRoster(page);
  const counters=await page.evaluate(()=>({canvases:document.querySelectorAll('canvas').length,views:window.__familiarViews.size,geometries:window.__familiarRenderer.info.memory.geometries,textures:window.__familiarRenderer.info.memory.textures,shared:[...window.__familiarViews.values()].every(v=>v.gl===window.__familiarRenderer)}));
  assert.equal(counters.canvases,1);assert.equal(counters.views,8);assert(counters.shared);report.navigation.push(counters);
 }
 const geometryCounts=report.navigation.map(row=>row.geometries);assert(Math.max(...geometryCounts)-Math.min(...geometryCounts)<=4,`GPU geometry counts grow across navigation: ${geometryCounts}`);
 await page.evaluate(()=>window.__familiarRenderer.forceContextLoss());await page.waitForFunction(()=>document.querySelectorAll('[aria-label="Eight Hardlight Familiars"] [data-renderer="fallback"]').length===8);assert.equal(await page.locator('[aria-label="Eight Hardlight Familiars"] img').count(),8,'Lost shared renderer must label each fallback');
 await page.screenshot({path:'artifacts/3d/shared-context-loss-fallback.png'});report.sharedContextFallback=true;
 await page.getByRole('button',{name:'Model Control',exact:true}).click();await page.getByRole('heading',{name:'Model Control Center',exact:true}).waitFor();
 assert.deepEqual(errors,[],'Browser runtime errors');report.pageErrors=errors;await context.close();
 report.responsive=[];
 for(const [width,height,deviceScaleFactor] of [[1440,900,1],[1920,1080,1],[1536,864,1.25],[1024,768,1]]){
  const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor,reducedMotion:'reduce'});await restrict(ctx);const p=await ctx.newPage();await p.goto('http://127.0.0.1:1421/',{waitUntil:'domcontentloaded'});await waitRoster(p);assert.equal(await p.locator('canvas').count(),1);assert.equal(await p.locator('[aria-label="Eight Hardlight Familiars"] [data-renderer="three"]').count(),8);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await p.getByRole('button',{name:'Mascot Studio',exact:true}).click();await p.getByLabel('Preview familiar',{exact:true}).selectOption('deepseek');await waitStudio(p,'deepseek');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const png=await p.screenshot({path:`artifacts/3d/responsive-${width}x${height}-dpr${deviceScaleFactor}.png`});assert.equal(png.readUInt32BE(16),Math.round(width*deviceScaleFactor));report.responsive.push({width,height,deviceScaleFactor,physicalScreenshotWidth:png.readUInt32BE(16)});await ctx.close();
 }
 report.passed=true;await fs.writeFile('artifacts/3d/all-familiars-acceptance.json',JSON.stringify(report,null,2));console.log('All eight actual 3D models, named joint animation, Off/reduced motion, shared inspector orbit, context-loss fallbacks, three navigation cycles and four responsive viewports passed. Software WebGL only.');
})().catch(async error=>{report.error=error.stack||String(error);await fs.mkdir('artifacts/3d',{recursive:true}).catch(()=>{});await fs.writeFile('artifacts/3d/all-familiars-acceptance.json',JSON.stringify(report,null,2)).catch(()=>{});console.error(error);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
