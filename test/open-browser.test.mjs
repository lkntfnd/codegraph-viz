import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

import { openBrowser } from '../src/open-browser.mjs';

const URL = 'http://127.0.0.1:7700/?view=architecture&focus=main';

function captureLaunch(platform) {
  let launch;
  let unrefCalled = false;
  const child = new EventEmitter();
  child.unref = () => { unrefCalled = true; };

  const returned = openBrowser(URL, {
    platform,
    spawnImpl(command, args, options) {
      launch = { command, args, options };
      return child;
    },
  });

  return { child, launch, returned, unrefCalled };
}

test('opens macOS URLs directly without a shell', () => {
  const result = captureLaunch('darwin');

  assert.equal(result.launch.command, 'open');
  assert.deepEqual(result.launch.args, [URL]);
  assert.equal(result.launch.options.shell, false);
  assert.equal(result.returned, result.child);
  assert.equal(result.unrefCalled, true);
});

test('opens Windows URLs through the protocol handler without cmd.exe', () => {
  const { launch } = captureLaunch('win32');

  assert.equal(launch.command, 'rundll32.exe');
  assert.deepEqual(launch.args, ['url.dll,FileProtocolHandler', URL]);
  assert.equal(launch.options.shell, false);
});

test('opens Linux URLs through xdg-open without a shell', () => {
  const { launch } = captureLaunch('linux');

  assert.equal(launch.command, 'xdg-open');
  assert.deepEqual(launch.args, [URL]);
  assert.equal(launch.options.shell, false);
});
