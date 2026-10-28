const { chromium } = require(process.env.SWARM_PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs/promises');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1480, height: 980 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:1421', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Telegram Bots', exact: true }).click();
  await page.getByRole('heading', { name: 'Telegram Bots', exact: true }).waitFor();
  const identities = page.locator('section[aria-label="Telegram bot identities"]');
  if (await identities.getByRole('article').count() !== 8) throw new Error('All eight bot slots must be shown');
  const tokens = identities.locator('input[type=password]');
  if (await tokens.count() !== 8) throw new Error('Each bot requires one masked credential entry');
  for (const field of await tokens.all()) {
    if (await field.isEnabled()) throw new Error('Browser preview must not accept native credentials');
    if (await field.inputValue()) throw new Error('No token may be seeded or persisted in the browser');
  }
  for (const card of await identities.getByRole('article').all()) { if (await card.locator(':scope > p').first().innerText() !== 'Not configured') throw new Error('Preview must not fabricate verified connections'); }
  await page.getByText('0 / 8 bots listening', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Pair Zero', exact: true }).waitFor();
  if (await page.getByRole('button', { name: 'Pair Zero', exact: true }).isEnabled()) throw new Error('Browser must not grant owner pairing');
  if (await page.getByRole('button', { name: 'Run harmless approval test', exact: true }).isEnabled()) throw new Error('Unpaired preview cannot request approval tests');
  await fs.mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/telegram-bots-unconfigured.png', fullPage: true });
  await page.getByRole('button', { name: 'Edit identity, role & permissions', exact: true }).first().click();
  await page.getByText('Personality affects wording only. HQ remains the approval authority.', { exact: true }).waitFor();
  // Native status refreshes must not produce false evidence in the preview.
  const persisted = await page.evaluate(() => JSON.stringify(Object.values(localStorage)));
  if (/TELEGRAM_BOT_TOKEN|telegram-token-hq|"tokenPresent":true/.test(persisted)) throw new Error('Telegram secrets or fictitious connectivity entered frontend persistence');
  if (errors.length) throw new Error(errors.join('\n'));
  await browser.close();
  console.log('Telegram UI smoke passed: eight unconfigured identities, masked empty token entries, native-only setup, pairing and approval guards, no browser errors.');
})().catch((error) => { console.error(error); process.exit(1); });
