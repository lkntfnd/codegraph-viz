// src/open-browser.mjs — open local URLs without invoking a command shell.

import { spawn } from 'node:child_process';

/** Open a URL with the platform's browser without passing it through a shell. */
export function openBrowser(url, { platform = process.platform, spawnImpl = spawn } = {}) {
  let command;
  let args;

  if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (platform === 'win32') {
    command = 'rundll32.exe';
    args = ['url.dll,FileProtocolHandler', url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  const child = spawnImpl(command, args, {
    detached: true,
    shell: false,
    stdio: 'ignore',
    windowsHide: true,
  });

  // Browser discovery should never bring down the local server.
  child.once('error', () => {});
  child.unref();
  return child;
}
