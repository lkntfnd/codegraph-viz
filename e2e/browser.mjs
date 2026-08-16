import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';

import { chromium } from 'playwright';

const projectRoot = new URL('..', import.meta.url);

function fixtureUrl(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const onData = (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (match) resolve(match[0]);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code && !/http:\/\/127\.0\.0\.1:\d+\//.test(output)) {
        reject(new Error(`Fixture exited with ${code}: ${output}`));
      }
    });
  });
}

async function stopFixture(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGINT');
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode === null) child.kill();
}

test('browser boots every view and preserves the Architecture layout contract', async () => {
  const fixture = spawn(process.execPath, ['--no-warnings', 'scripts/serve-fixture.mjs'], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const url = await fixtureUrl(fixture);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1_440, height: 900 } });
  const errors = [];
  const remoteRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(url).origin) remoteRequests.push(request.url());
  });

  try {
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => document.querySelector('#graph-status')?.textContent?.includes('ready'));

    assert.equal(await page.locator('#layout-select').inputValue(), 'nodes');
    assert.deepEqual(await page.locator('#layout-select option').allTextContents(), ['Nodes', 'Structure tree']);
    assert.match(await page.locator('#layout-description').textContent(), /gravity and relationship forces/);
    assert.deepEqual(await page.locator('#graph').evaluate((canvas) => ({
      width: canvas.width > 0,
      height: canvas.height > 0,
    })), { width: true, height: true });

    await page.locator('#graph').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => !document.querySelector('#selection-inspector')?.hidden);
    assert.ok((await page.locator('#inspector-title').textContent()).trim());

    await page.locator('#layout-select').selectOption('structure-tree');
    await page.waitForFunction(() => (
      document.querySelector('#layout-select')?.value === 'structure-tree'
      && document.querySelector('#loading-veil')?.hidden
    ));
    await page.locator('#layout-select').selectOption('nodes');
    await page.waitForFunction(() => (
      document.querySelector('#layout-select')?.value === 'nodes'
      && document.querySelector('#loading-veil')?.hidden
    ));

    await page.locator('#tab-filedeps').click();
    await page.waitForFunction(() => document.querySelector('#tab-filedeps')?.getAttribute('aria-selected') === 'true');
    assert.deepEqual(await page.locator('#layout-select option').allTextContents(), [
      'Hotspot landscape', 'Dependency matrix',
    ]);

    await page.locator('#tab-callgraph').click();
    await page.waitForFunction(() => document.querySelector('#tab-callgraph')?.getAttribute('aria-selected') === 'true');
    assert.deepEqual(await page.locator('#layout-select option').allTextContents(), ['Impact flow', 'Radial reach']);
    assert.equal(await page.evaluate(() => globalThis.__fixtureXss), undefined);
    assert.deepEqual(remoteRequests, []);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await stopFixture(fixture);
  }
});
