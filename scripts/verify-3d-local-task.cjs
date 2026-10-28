const { chromium } = require(process.env.SWARM_PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');

// All state changes in this integration check go through visible application controls.
// DEV stores and scene hooks are inspected read-only to retain execution provenance.
(async () => {
  const directory = path.resolve('artifacts/3d/local-task');
  await fs.mkdir(directory, { recursive: true });
  const report = { startedAt: new Date().toISOString(), requests: [], unexpectedRequests: [], errors: [], observations: [], snapshots: {}, applied: false, nativeIPC: false, stateInjection: false };
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1180 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    const allowed = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && ['1421', '11434'].includes(url.port);
    const entry = { method: request.method(), endpoint: url.origin + url.pathname };
    if (!allowed) { report.unexpectedRequests.push(entry); await route.abort('blockedbyclient'); return; }
    if (url.port === '11434') report.requests.push(entry);
    await route.continue();
  });
  const read = () => page.evaluate(() => {
    const app = window.__stores.useApp.getState(), swarm = window.__stores.useSwarm.getState();
    return JSON.parse(JSON.stringify({ run: swarm.run, runIsLive: swarm.runIsLive, replaying: swarm.replaying, recorderError: swarm.recorderError, orchestrator: app.preferences.orchestrator, modelPolicy: app.preferences.modelPolicy, agents: app.agents.map((agent) => ({ name: agent.name, role: agent.role, enabled: agent.enabled })), providers: app.providers.filter((provider) => provider.local).map(({ id, verified, status, models }) => ({ id, verified, status, modelIds: models.map((model) => model.id) })), labels: [...document.querySelectorAll('.familiar-world-labels > div')].map((node) => node.innerText), graph: window.__commandCenter ? { meshCount: (() => { let count = 0; window.__commandCenter.scene.traverse((object) => { if (object.isMesh) count++; }); return count; })(), rootNames: window.__commandCenter.scene.children.map((object) => object.name).filter(Boolean) } : null }));
  });
  let cdp, frames = [], writes = [], recording = false;
  try {
    await page.goto('http://127.0.0.1:1421', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__stores?.useApp.getState().hydrated);
    await page.getByRole('button', { name: 'Integrations', exact: true }).click();
    const ollama = page.locator('div.glass.rounded-2xl').filter({ has: page.getByRole('heading', { name: 'Ollama', exact: true }) }).first();
    await ollama.getByRole('button', { name: /Test & connect|Re-test/ }).click();
    await page.waitForFunction(() => window.__stores.useApp.getState().providers.find((provider) => provider.id === 'ollama')?.verified, { timeout: 20000 });
    report.connected = (await read()).providers.find((provider) => provider.id === 'ollama');
    console.log(JSON.stringify({ setup: 'actual_ollama_catalog_verified', models: report.connected.modelIds.length }));
    if (!report.connected.modelIds.includes('qwen2.5-coder:7b')) throw new Error('Requested on-device qwen2.5-coder:7b was not returned by the real model catalog');

    await page.getByRole('button', { name: 'Model Control', exact: true }).click();
    await page.getByLabel('Task call cap', { exact: true }).fill('4');
    await page.getByLabel('Call timeout', { exact: true }).fill('180');
    const providerSection = page.locator('section.mission-panel').filter({ has: page.getByRole('heading', { name: 'Ollama', exact: true }) });
    await providerSection.locator('label').filter({ hasText: 'Explicit next-task override' }).locator('select').selectOption('qwen2.5-coder:7b');

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const engine = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Orchestrator', exact: true }) });
    await engine.getByRole('button', { name: 'Live', exact: true }).click();

    await page.getByRole('button', { name: 'Agent Team', exact: true }).click();
    const agents = (await read()).agents;
    for (const agent of agents.filter((agent) => !['planner', 'reviewer'].includes(agent.role))) {
      const control = page.getByRole('switch', { name: `Enable ${agent.name}`, exact: true });
      const desired = ['qa', 'docs'].includes(agent.role);
      if ((await control.getAttribute('aria-checked') === 'true') !== desired) await control.click();
    }
    report.configuration = await read();
    if (report.configuration.agents.filter((agent) => agent.enabled && !['planner', 'reviewer'].includes(agent.role)).map((agent) => agent.role).sort().join(',') !== 'docs,qa') throw new Error('Visible role configuration did not select QA and docs');
    console.log(JSON.stringify({ setup: 'visible_controls_configured', engine: report.configuration.orchestrator, workerRoles: ['qa', 'docs'], callCap: report.configuration.modelPolicy?.maxCalls }));

    await page.getByRole('button', { name: 'Swarm', exact: true }).click();
    await page.getByRole('button', { name: 'Open 3D command center', exact: true }).click();
    await page.getByLabel('Hardlight 3D command center', { exact: true }).scrollIntoViewIfNeeded();
    await page.waitForFunction(() => !!window.__commandCenter?.scene);
    await page.getByLabel('Run mode', { exact: true }).selectOption('local-only');
    await page.getByRole('button', { name: '2', exact: true }).click();
    const prompt = 'Create a tiny offline workflow proof with exactly two workers. QA owns index.html: a static HTML page with the heading Local workflow verified. Docs owns README.md: explain opening index.html. Both workers must produce their own file; no dependencies. Keep each file below 8 lines. Reviewer inspects both complete outputs. No scripts, network, tools, or project writes. Proposals only; Zero alone approves applying files.';
    await page.getByLabel('Task prompt', { exact: true }).fill(prompt);
    await page.getByRole('button', { name: /Run swarm/ }).click();
    await page.getByLabel('Hardlight 3D command center', { exact: true }).scrollIntoViewIfNeeded();

    cdp = await context.newCDPSession(page);
    cdp.on('Page.screencastFrame', (frame) => {
      const name = `actual-frame-${String(frames.length).padStart(5, '0')}.jpg`;
      frames.push({ name, timestamp: frame.metadata.timestamp });
      writes.push(fs.writeFile(path.join(directory, name), Buffer.from(frame.data, 'base64')).then(() => cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {})));
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 1600, maxHeight: 1180, everyNthFrame: 2 }); recording = true;
    const end = Date.now() + 240000; let lastStatus = '', lastProgress = 0;
    while (Date.now() < end) {
      const snapshot = await read(), run = snapshot.run;
      if (!run || run.source !== 'live' || !snapshot.runIsLive || snapshot.replaying) throw new Error('The visible workflow did not produce actual live execution provenance');
      if (!report.runId) { report.runId = run.id; report.taskId = run.task.id; console.log(JSON.stringify({ runId: run.id, status: run.status, provider: 'ollama', model: 'qwen2.5-coder:7b' })); }
      report.observations.push({ at: new Date().toISOString(), status: run.status, workers: run.workers.map(({ id, role, status, providerId, modelId, requestedModel, recentAction, tokensIn, tokensOut }) => ({ id, role, status, providerId, modelId, requestedModel, recentAction, tokensIn, tokensOut })), labels: snapshot.labels, source: run.source, runIsLive: snapshot.runIsLive });
      if (lastStatus !== run.status) {
        lastStatus = run.status; report.snapshots[run.status] = snapshot;
        await page.screenshot({ path: path.join(directory, `${run.id}-${run.status}.png`) });
        console.log(JSON.stringify({ runId: run.id, status: run.status, observedTokens: run.metrics.tokensIn + run.metrics.tokensOut, labels: snapshot.labels }));
      }
      if (Date.now() - lastProgress > 30000) { lastProgress = Date.now(); console.log(JSON.stringify({ runId: run.id, status: run.status, elapsedMs: run.elapsedMs })); }
      if (['completed', 'failed', 'stopped'].includes(run.status)) { report.final = snapshot; break; }
      await page.waitForTimeout(150);
    }
    if (!report.final) throw new Error('Actual local workflow exceeded the 240-second verification limit');
    await cdp.send('Page.stopScreencast'); recording = false; await Promise.all(writes);
    report.recording = { frameCount: frames.length, durationSeconds: frames.length > 1 ? frames.at(-1).timestamp - frames[0].timestamp : 0, actualBrowserFrames: true };
    await fs.writeFile(path.join(directory, 'frames.txt'), frames.map((frame, index) => `file '${frame.name}'\nduration ${index + 1 < frames.length ? Math.max(0.001, frames[index + 1].timestamp - frame.timestamp) : 0.04}`).join('\n') + '\n');
    const run = report.final.run;
    report.callCount = report.requests.filter((request) => request.endpoint.endsWith('/chat/completions')).length;
    report.status = run.status; report.reviewVerdict = run.reviewVerdict;
    report.proposedFiles = run.fileChanges.map(({ path, workerId, role }) => ({ path, workerId, role }));
    report.complete = run.status === 'completed' && run.reviewVerdict === 'approved' && report.callCount === 4 && run.workers.every((worker) => worker.providerId === 'ollama') && ['planning', 'running', 'reviewing', 'completed'].every((phase) => report.snapshots[phase]);
    if (report.unexpectedRequests.length) throw new Error('An unexpected external request was blocked; inspect the local report');
    console.log(JSON.stringify({ runId: report.runId, status: report.status, reviewVerdict: report.reviewVerdict, callCount: report.callCount, proposedFiles: report.proposedFiles, recording: report.recording, complete: report.complete }));
    if (!report.complete) throw new Error('Actual execution evidence did not satisfy every requested phase/review check');
  } catch (error) {
    report.failure = error.message; console.log(JSON.stringify({ failure: report.failure, runId: report.runId ?? null }));
    try { report.lastObserved = await read(); await page.screenshot({ path: path.join(directory, 'failure.png') }); } catch {}
    process.exitCode = 1;
  } finally {
    if (recording) { try { await cdp.send('Page.stopScreencast'); await Promise.all(writes); } catch {} }
    await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
    await context.close(); await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
