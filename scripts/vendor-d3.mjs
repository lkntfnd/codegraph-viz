// scripts/vendor-d3.mjs — copy the pinned D3 browser bundle byte-for-byte.

import { copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const d3Entry = fileURLToPath(import.meta.resolve('d3'));
const source = resolve(dirname(d3Entry), '..', 'dist', 'd3.min.js');
const destination = fileURLToPath(new URL('../public/vendor/d3.v7.min.js', import.meta.url));

await copyFile(source, destination);
