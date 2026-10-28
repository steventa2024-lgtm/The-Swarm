/* Actual local UI / WebGL evidence only. No inference, Telegram, approvals, or
 * application-state injection. Software rendering is not a hardware benchmark. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
let playwright;
for (const location of [process.env.SWARM_PLAYWRIGHT_PATH, 'playwright', 'C:/Users/steve/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'].filter(Boolean)) {
  try { playwright = require(location); break; } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
}
if (!playwright) throw Error('Set SWARM_PLAYWRIGHT_PATH to an installed Playwright package');
const IDS = ['hq', 'codex', 'claude', 'gemini', 'cursor', 'grok', 'deepseek', 'ollama'];
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const directory = path.resolve('artifacts/3d');
const report = { passed: false, softwareWebGL: true, browserArgs: args, limits: 'Headless Microsoft Edge with explicit SwiftShader software rendering. Render FPS is observed software performance, not a hardware, macOS, native Windows, or native DPI result.', checks: [], quality: [], navigation: [], screenshots: [] };
let browser, page;
const delay = (ms = 650) => page.waitForTimeout(ms);
async function snapshot() {
  return page.evaluate(ids => {
    const entry = window.__commandCenter;
    if (!entry) throw Error('Actual command-center scene missing');
    const models = {};
    for (const id of ids) {
      const root = entry.scene.getObjectByName(id === 'codex' ? 'codex-articulated-wolf' : `familiar-${id}`);
      if (!root) throw Error(`Actual ${id} mesh root missing`);
      const joints = {}; let meshes = 0;
      root.traverse(node => {
        if (node.isMesh) meshes++;
        if (node !== root && node.name && (node.isGroup || node.isBone)) joints[node.name] = [...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray(), Number(node.visible)];
      });
      models[id] = { meshes, joints };
    }
    const gl = entry.gl.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { models, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), rendererId: entry.gl.uuid, contextLost: gl.isContextLost(), canvasCount: document.querySelectorAll('canvas').length, geometries: entry.gl.info.memory.geometries, textures: entry.gl.info.memory.textures };
  }, IDS);
}
function deltas(first, second) {
  return Object.fromEntries(IDS.map(id => {
    const a = first.models[id].joints, b = second.models[id].joints;
    const values = Object.keys(a).flatMap(name => a[name].map((v, i) => Math.abs(v - b[name][i])));
    return [id, Math.max(0, ...values)];
  }));
}
async function waitTeam() {
  await page.waitForFunction(ids => ids.every(id => window.__commandCenter?.scene.getObjectByName(id === 'codex' ? 'codex-articulated-wolf' : `familiar-${id}`)), IDS, { timeout: 30000 });
  await page.getByLabel('Hardlight 3D command center', { exact: true }).scrollIntoViewIfNeeded();
  await delay();
}
async function waitRoster() {
  await page.getByRole('heading', { name: 'Mission control.', exact: true }).waitFor();
  await page.waitForFunction(ids => ids.every(id => window.__familiarViews?.get(id)?.scene.getObjectByName(id === 'codex' ? 'codex-articulated-wolf' : `familiar-${id}`)), IDS, { timeout: 30000 });
  await delay();
}
async function save(name, locator = page.getByLabel('Hardlight 3D command center', { exact: true })) {
  const file = path.join(directory, name); await locator.screenshot({ path: file }); report.screenshots.push(file);
}
async function camera() { return page.evaluate(() => [...window.__familiar3d.camera.position.toArray(), ...window.__familiar3d.camera.quaternion.toArray()]); }
async function recording(context) {
  const target = path.join(directory, 'team-preview-frames'); await fs.mkdir(target, { recursive: true });
  const cdp = await context.newCDPSession(page), frames = [], writes = [];
  cdp.on('Page.screencastFrame', frame => {
    const name = `frame-${String(frames.length).padStart(5, '0')}.jpg`;
    frames.push({ name, timestamp: frame.metadata.timestamp });
    writes.push(fs.writeFile(path.join(target, name), Buffer.from(frame.data, 'base64')).then(() => cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId })));
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 86, maxWidth: 1480, maxHeight: 980, everyNthFrame: 1 });
  await delay(12000);
  await cdp.send('Page.stopScreencast'); await Promise.all(writes); await cdp.detach();
  assert(frames.length > 2, 'Actual viewport recording has too few frames');
  await fs.writeFile(path.join(target, 'frames.txt'), frames.map((frame, index) => `file '${frame.name}'\nduration ${index + 1 < frames.length ? Math.max(.001, frames[index + 1].timestamp - frame.timestamp) : .04}`).join('\n') + '\n');
  const clip = path.join(directory, 'eight-team-preview.mp4');
  report.recording = { frames: frames.length, elapsedSeconds: frames.at(-1).timestamp - frames[0].timestamp, description: 'Real CDP viewport frames with original timestamps; preview only, no generated/interpolated animation frames.', framesDirectory: target };
  const ffmpeg = process.env.SWARM_FFMPEG_PATH || 'C:/Users/steve/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0-full_build/bin/ffmpeg.exe';
  try {
    execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-safe', '0', '-f', 'concat', '-i', path.join(target, 'frames.txt'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-fps_mode', 'vfr', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', clip], { timeout: 60000, windowsHide: true });
    report.recording.mp4 = clip;
  } catch (error) { report.recording.encodeError = String(error.message); }
}
(async () => {
  await fs.mkdir(directory, { recursive: true });
  browser = await playwright.chromium.launch({ channel: 'msedge', headless: true, args });
  const context = await browser.newContext({ viewport: { width: 1480, height: 980 }, reducedMotion: 'no-preference' });
  await context.route('**/*', route => { const u = new URL(route.request().url()); return ['127.0.0.1', 'localhost'].includes(u.hostname) && u.port === '1421' ? route.continue() : route.abort(); });
  page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:1421/', { waitUntil: 'domcontentloaded' }); await waitRoster();
  await page.getByRole('button', { name: 'Mascot Studio', exact: true }).click();
  await page.getByRole('heading', { name: 'Hardlight Familiars', exact: true }).waitFor();
  await page.getByLabel('Motion preference', { exact: true }).selectOption('full');
  await page.getByLabel('Visual quality', { exact: true }).selectOption('medium');
  await page.getByLabel('Preview state', { exact: true }).selectOption('working');
  await page.getByRole('button', { name: 'All eight · team preview', exact: true }).click(); await waitTeam();
  await page.getByText('PREVIEW · No real work or handoffs', { exact: true }).waitFor();
  await page.getByText('PREVIEW · All eight animate together; no real task or handoffs', { exact: true }).waitFor();
  assert.equal(await page.locator('canvas').count(), 1);
  const a = await snapshot(); await delay(1300); const b = await snapshot();
  report.workingDeltas = deltas(a, b); report.renderer = a.renderer;
  for (const id of IDS) { assert(a.models[id].meshes > 15); assert(report.workingDeltas[id] > 1e-6, `${id} has no actual working joint motion`); }
  report.modelMeshCounts = Object.fromEntries(IDS.map(id => [id, a.models[id].meshes]));
  report.checks.push('Eight real articulated models animate simultaneously in one explicitly labeled preview Canvas');
  console.log('Eight simultaneous working previews verified.'); await save('eight-team-preview.png');
  await recording(context);
  report.observedSoftwarePerformance = await page.locator('.familiar-command-center .familiar-3d-controls').innerText();
  await page.getByLabel('Motion preference', { exact: true }).selectOption('off'); await delay(850);
  const offA = await snapshot(); await delay(1200); report.offDeltas = deltas(offA, await snapshot());
  for (const id of IDS) assert(report.offDeltas[id] < 1e-8, `${id} moved while Off`);
  await page.getByLabel('Motion preference', { exact: true }).selectOption('full'); await page.emulateMedia({ reducedMotion: 'reduce' }); await delay(850);
  const reducedA = await snapshot(); await delay(1200); report.reducedDeltas = deltas(reducedA, await snapshot());
  for (const id of IDS) assert(report.reducedDeltas[id] < 1e-8, `${id} moved with OS reduced motion`);
  report.checks.push('Motion Off and system reduced motion freeze every model joint');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const rendererHandle = await page.evaluateHandle(() => window.__commandCenter.gl);
  for (const quality of ['low', 'medium', 'high', 'cinematic', 'medium']) {
    await page.getByLabel('Visual quality', { exact: true }).selectOption(quality); await delay(1600);
    const current = await snapshot();
    const sameRenderer = await page.evaluate(renderer => renderer === window.__commandCenter.gl, rendererHandle);
    assert(sameRenderer, `${quality} recreated WebGL renderer`); assert(!current.contextLost, `${quality} lost WebGL context`); assert.equal(current.canvasCount, 1);
    assert.equal(await page.locator('.familiar-command-center .familiar-3d-fallback').count(), 0);
    report.quality.push({ quality, sameRenderer, canvasCount: current.canvasCount, contextLost: current.contextLost, geometries: current.geometries, diagnostics: await page.locator('.familiar-command-center .familiar-3d-controls').innerText() });
  }
  report.checks.push('Low, Medium, High and Cinematic switches preserve the single live WebGL renderer');
  await rendererHandle.dispose();
  console.log('All models freeze for Off/reduced motion; all quality switches preserve WebGL.');
  await page.getByRole('button', { name: 'Return to character view', exact: true }).click();
  await page.waitForFunction(() => !!window.__familiar3d?.scene.getObjectByName('codex-articulated-wolf'));
  await page.getByRole('button', { name: 'front', exact: true }).click(); await delay(800); const front = await camera();
  await page.locator('.familiar-3d-stage').scrollIntoViewIfNeeded();
  const bounds = await page.locator('.familiar-3d-stage canvas').boundingBox(); assert(bounds);
  await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .5); await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .7, bounds.y + bounds.height * .56, { steps: 12 }); await page.mouse.up(); await delay(750);
  const orbit = await camera(); assert(front.some((v, i) => Math.abs(v - orbit[i]) > .01), 'Actual character orbit camera did not change');
  await page.getByRole('button', { name: 'front', exact: true }).click(); await delay(900); const reset = await camera();
  report.camera = { front, orbit, reset };
  assert(front.every((v, i) => Math.abs(v - reset[i]) < .001), 'Re-clicking camera preset did not reset orbit');
  report.checks.push('Return to character view preserves actual orbit and re-clicking a camera preset resets it');
  await page.getByRole('button', { name: 'All eight · team preview', exact: true }).click(); await waitTeam();
  // Project a real head mesh center to screen, then use the actual pointer/raycast path.
  const point = await page.evaluate(() => {
    const { scene, camera, gl } = window.__commandCenter, root = scene.getObjectByName('familiar-gemini'); let mesh;
    root.traverse(node => { if (!mesh && node.isMesh) mesh = node; }); mesh.updateWorldMatrix(true, false);
    const p = mesh.position.clone().set(0, 0, 0).applyMatrix4(mesh.matrixWorld).project(camera), box = gl.domElement.getBoundingClientRect();
    return { x: box.x + (p.x * .5 + .5) * box.width, y: box.y + (-p.y * .5 + .5) * box.height };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => document.querySelector('[aria-label="Preview familiar"]')?.value === 'gemini' && !!window.__familiar3d?.scene.getObjectByName('familiar-gemini'), undefined, { timeout: 15000 });
  report.meshClick = { selected: 'gemini', pointer: point }; report.checks.push('Actual 3D mesh raycast opens the selected familiar in character Studio');
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.getByRole('button', { name: 'Swarm', exact: true }).click(); await waitRoster();
    assert.equal(await page.locator('canvas').count(), 1);
    await page.getByRole('button', { name: 'Open 3D command center', exact: true }).click(); await waitTeam();
    await page.getByText('IDLE · No active task; movement is personality only', { exact: true }).waitFor();
    const world = await snapshot(); assert.equal(world.canvasCount, 1);
    await page.getByRole('button', { name: 'Return to eight-agent roster', exact: true }).click(); await waitRoster();
    const roster = await page.evaluate(() => ({ canvasCount: document.querySelectorAll('canvas').length, views: window.__familiarViews.size, geometries: window.__familiarRenderer.info.memory.geometries, textures: window.__familiarRenderer.info.memory.textures }));
    assert.equal(roster.canvasCount, 1); assert.equal(roster.views, 8); report.navigation.push({ world: { geometries: world.geometries, textures: world.textures, canvasCount: world.canvasCount }, roster });
  }
  const memories = report.navigation.map(row => row.roster.geometries); assert(Math.max(...memories) - Math.min(...memories) <= 4, 'Navigation leaked model geometries');
  report.checks.push('Three actual command-center/roster navigation cycles keep one Canvas and stable geometry counts');
  await page.getByRole('button', { name: 'Open 3D command center', exact: true }).click(); await waitTeam();
  await page.evaluate(() => window.__commandCenter.gl.forceContextLoss());
  await page.getByText('WebGL unavailable. Return to the roster for labeled static fallbacks.', { exact: true }).waitFor();
  await save('team-context-loss-fallback.png');
  await page.getByRole('button', { name: 'Model Control', exact: true }).click(); await page.getByRole('heading', { name: 'Model Control Center', exact: true }).waitFor();
  report.checks.push('Actual command-center context loss shows labeled fallback and sidebar navigation remains usable');
  report.pageErrors = errors; assert.deepEqual(errors, [], 'Browser runtime errors'); report.passed = true;
  await context.close(); console.log(`${report.checks.length} focused team-preview acceptance groups passed. Software WebGL only.`);
})().catch(async error => { report.error = error.stack || String(error); console.error(error); process.exitCode = 1; if (page) await page.screenshot({ path: path.join(directory, 'team-preview-failure.png') }).catch(() => {}); }).finally(async () => { await fs.mkdir(directory, { recursive: true }); await fs.writeFile(path.join(directory, 'team-preview-acceptance.json'), JSON.stringify(report, null, 2)); if (browser) await browser.close(); });
