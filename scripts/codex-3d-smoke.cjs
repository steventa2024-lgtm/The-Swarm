/* Stage A acceptance against actual Three objects, not screenshots or DOM labels alone.
 * Requires the DEV-only __familiar3d hook. Runs isolated, preview-only and localhost-only.
 * SwiftShader is requested explicitly: this is not a hardware-GPU performance benchmark. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

function loadPlaywright() {
  const candidates = [process.env.SWARM_PLAYWRIGHT_PATH, 'playwright', 'C:/Users/steve/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'].filter(Boolean);
  for (const candidate of candidates) { try { return require(candidate); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; } }
  throw new Error('Playwright unavailable. Set SWARM_PLAYWRIGHT_PATH to an installed package.');
}
const { chromium } = loadPlaywright();
const ROOT = 'codex-articulated-wolf';
const JOINTS = [
  'wolf-chest', 'wolf-neck', 'wolf-head', 'wolf-jaw', 'wolf-ear-left', 'wolf-ear-right',
  'wolf-tail-0', 'wolf-tail-1', 'wolf-tail-2',
  ...['front', 'rear'].flatMap(end => ['left', 'right'].flatMap(side => ['hip', 'knee', 'paw'].map(joint => `wolf-leg-${end}-${side}-${joint}`))),
  ...['left', 'right'].flatMap(side => ['upper-lid', 'lower-lid', 'brow'].map(joint => `wolf-eye-${side}-${joint}`)),
];
const OUT = path.resolve('artifacts/3d');
const report = { environment: 'Headless Microsoft Edge; ANGLE SwiftShader software WebGL explicitly requested. FPS is not hardware performance.', browserArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], previewOnly: true, checks: [], screenshots: [], blockedRequests: [] };
let browser;

async function snapshot(page) {
  return page.evaluate(({ rootName, names }) => {
    const evidence = window.__familiar3d;
    if (!evidence) throw new Error('DEV-only Three scene hook unavailable');
    const root = evidence.scene.getObjectByName(rootName);
    if (!root) throw new Error('Actual articulated mesh root missing');
    root.updateWorldMatrix(true, true);
    let meshes = 0;
    const textureMaps = [], portraitPlanes = [], geometryTypes = new Set();
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    root.traverse(node => {
      if (!node.isMesh) return;
      meshes++;
      const geometry = node.geometry;
      geometryTypes.add(geometry.type);
      if (/^Plane(?:Buffer)?Geometry$/.test(geometry.type)) portraitPlanes.push(node.name || node.uuid);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        for (const key of Object.keys(material)) if (material[key]?.isTexture) textureMaps.push(`${node.name || node.type}:${key}`);
      }
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      if (!box) return;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const point = box.min.clone().set(x, y, z).applyMatrix4(node.matrixWorld).toArray();
        for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], point[i]); max[i] = Math.max(max[i], point[i]); }
      }
    });
    const joints = {};
    for (const name of names) {
      const joint = root.getObjectByName(name);
      if (!joint) throw new Error(`Named articulated joint missing: ${name}`);
      joints[name] = [...joint.position.toArray(), ...joint.quaternion.toArray(), ...joint.scale.toArray(), Number(joint.visible)];
    }
    const context = evidence.gl.getContext(), debug = context.getExtension('WEBGL_debug_renderer_info');
    return {
      meshes, geometryTypes: [...geometryTypes], textureMaps, portraitPlanes,
      bounds: { min, max, size: max.map((value, i) => value - min[i]) }, joints,
      camera: { perspective: !!evidence.camera.isPerspectiveCamera, position: evidence.camera.position.toArray(), quaternion: evidence.camera.quaternion.toArray() },
      renderer: { vendor: debug ? context.getParameter(debug.UNMASKED_VENDOR_WEBGL) : context.getParameter(context.VENDOR), device: debug ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER), dpr: evidence.gl.getPixelRatio(), renderCalls: evidence.gl.info.render.calls, triangles: evidence.gl.info.render.triangles },
    };
  }, { rootName: ROOT, names: JOINTS });
}
function changedJoints(a, b, tolerance = 1e-6) { return JOINTS.filter(name => a.joints[name].some((value, index) => Math.abs(value - b.joints[name][index]) > tolerance)); }
function maxJointDelta(a, b) { return Math.max(...JOINTS.flatMap(name => a.joints[name].map((value, index) => Math.abs(value - b.joints[name][index])))); }
function distance(a, b) { return Math.hypot(...a.map((value, index) => value - b[index])); }
async function capture(stage, name) { const output = path.join(OUT, `${name}.png`); await stage.screenshot({ path: output }); report.screenshots.push(path.relative(process.cwd(), output)); }
async function settle(page, ms = 800) { await page.waitForTimeout(ms); }

(async () => {
  await fs.mkdir(OUT, { recursive: true });
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: report.browserArgs });
  const context = await browser.newContext({ viewport: { width: 1480, height: 980 }, reducedMotion: 'no-preference' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.port === '1421') return route.continue();
    if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
    report.blockedRequests.push(`${url.protocol}//${url.host}`);
    return route.abort();
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:1421/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Mascot Studio', exact: true }).click();
  await page.getByRole('heading', { name: 'Hardlight Familiars', exact: true }).waitFor();
  await page.getByLabel('Visual quality', { exact: true }).selectOption('medium');
  await page.getByLabel('Motion preference', { exact: true }).selectOption('full');
  await page.getByLabel('Preview state', { exact: true }).selectOption('idle');
  const stage = page.locator('.familiar-3d-stage').first();
  await stage.scrollIntoViewIfNeeded();
  await page.waitForFunction(name => !!window.__familiar3d?.scene.getObjectByName(name), ROOT, { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector('.familiar-3d-stage')?.dataset.active === 'true');
  await settle(page);
  const initial = await snapshot(page);
  assert(initial.meshes > 50, `Only ${initial.meshes} actual meshes; expected articulated volume`);
  assert(initial.bounds.size.every(value => value > 0.5), `Model lacks volume on an axis: ${initial.bounds.size}`);
  assert.equal(initial.textureMaps.length, 0, 'Character contains an image/texture map');
  assert.equal(initial.portraitPlanes.length, 0, 'Character contains a portrait plane');
  assert(initial.camera.perspective, 'The camera is not a real perspective camera');
  report.model = initial;
  report.checks.push('Actual model: >50 meshes, three-dimensional bounds, perspective camera, zero image maps or portrait-plane geometry');

  const idleA = await snapshot(page);
  await settle(page, 2200);
  const idleB = await snapshot(page), idleChanges = changedJoints(idleA, idleB);
  assert(idleChanges.length >= 2, `Idle joints did not animate over two seconds: ${idleChanges}`);
  report.idleChanges = idleChanges;
  await page.getByLabel('Preview state', { exact: true }).selectOption('working');
  await settle(page, 1000);
  const working = await snapshot(page), stateChanges = changedJoints(idleB, working);
  assert(stateChanges.length >= 3, `Idle/working state poses do not differ: ${stateChanges}`);
  await settle(page, 2200);
  const workingLater = await snapshot(page), workingChanges = changedJoints(working, workingLater);
  assert(workingChanges.some(name => name.includes('leg-')), 'Working preview has no actual moving leg joints');
  report.workingChanges = workingChanges; report.stateChanges = stateChanges;
  report.checks.push('Preview-only idle movement and working gait alter named actual joint transforms');
  await capture(stage, 'working');

  const cameras = {};
  await page.getByLabel('Preview state', { exact: true }).selectOption('idle');
  for (const view of ['front', 'side', 'rear']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await settle(page, 700);
    cameras[view] = (await snapshot(page)).camera;
    await capture(stage, view);
  }
  for (const [a, b] of [['front', 'side'], ['side', 'rear'], ['front', 'rear']]) assert(distance(cameras[a].position, cameras[b].position) > 2, `${a}/${b} camera positions are indistinguishable`);
  report.cameras = cameras; report.checks.push('Front, side and rear controls move the real perspective camera');

  await page.getByLabel('Motion preference', { exact: true }).selectOption('off');
  await settle(page, 800);
  const offA = await snapshot(page); await settle(page, 2200); const offB = await snapshot(page);
  report.motionOffMaxDelta = maxJointDelta(offA, offB);
  assert(report.motionOffMaxDelta < 1e-8, `Motion Off still moves actual joints: ${report.motionOffMaxDelta}`);
  await capture(stage, 'motion-off');
  await page.getByLabel('Motion preference', { exact: true }).selectOption('full');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.querySelector('.familiar-3d-stage')?.dataset.motion === 'off');
  await settle(page, 800);
  const reducedA = await snapshot(page); await settle(page, 2200); const reducedB = await snapshot(page);
  report.reducedMotionMaxDelta = maxJointDelta(reducedA, reducedB);
  assert(report.reducedMotionMaxDelta < 1e-8, `System reduced motion still moves actual joints: ${report.reducedMotionMaxDelta}`);
  await capture(stage, 'reduced-motion');
  report.checks.push('Motion Off and OS reduced-motion freeze actual joint transforms after settling');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // Use real scrolling/viewport changes; do not inject fake visibility or global application state.
  await page.getByText('Original identity references · static artwork', { exact: true }).click();
  await page.setViewportSize({ width: 1480, height: 760 });
  await page.evaluate(() => {
    let node = document.querySelector('.familiar-3d-stage')?.parentElement;
    while (node) {
      if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) { node.scrollTop = node.scrollHeight; return; }
      node = node.parentElement;
    }
    throw new Error('No real scrollable studio container found');
  });
  await page.waitForFunction(() => document.querySelector('.familiar-3d-stage')?.dataset.active === 'false', { timeout: 10_000 });
  await settle(page, 700);
  const hiddenA = await snapshot(page); await settle(page, 2200); const hiddenB = await snapshot(page);
  report.offscreenMaxDelta = maxJointDelta(hiddenA, hiddenB);
  assert(report.offscreenMaxDelta < 1e-8, `Offscreen stage still moves actual joints: ${report.offscreenMaxDelta}`);
  report.checks.push('Real offscreen IntersectionObserver state stops autonomous joint animation');
  await page.setViewportSize({ width: 1480, height: 980 });
  await stage.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.familiar-3d-stage')?.dataset.active === 'true');
  report.diagnostics = await page.getByLabel('3D renderer diagnostics').innerText();

  await page.evaluate(() => window.__familiar3d.gl.forceContextLoss());
  await page.getByText('3D renderer unavailable', { exact: true }).waitFor();
  await page.getByText('Agent tasks and approval controls remain available. This is a labeled static reference fallback.', { exact: true }).waitFor();
  await capture(stage, 'context-loss-fallback');
  await page.getByRole('button', { name: 'Swarm', exact: true }).click();
  await page.getByRole('heading', { name: 'Mission control.', exact: true }).waitFor();
  report.checks.push('Forced real WebGL context loss shows labeled fallback; sidebar returns to the usable task workspace');
  assert.equal(errors.length, 0, `Browser errors: ${errors.join('\n')}`);
  report.passed = true;
  await fs.writeFile(path.join(OUT, 'stage-a-acceptance.json'), JSON.stringify(report, null, 2));
  console.log(`Stage A 3D smoke passed (${report.checks.length} checks). Meshes: ${initial.meshes}; bounds: ${initial.bounds.size.map(n => n.toFixed(2)).join(' × ')}. ${report.environment}`);
})().catch(async error => {
  report.passed = false; report.error = error.stack || String(error);
  await fs.mkdir(OUT, { recursive: true }).catch(() => {});
  await fs.writeFile(path.join(OUT, 'stage-a-acceptance.json'), JSON.stringify(report, null, 2)).catch(() => {});
  console.error(error); process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
